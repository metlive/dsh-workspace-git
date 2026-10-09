/**
 * Commit filtering for the graph: facet extraction, reachability, and the
 * predicate the pane applies.
 *
 * ## Filtering happens on the client, on purpose
 *
 * The graph page already carries everything a filter needs — each commit's
 * `parents` and its ref decorations. Filtering the array and re-running
 * `layoutGitGraph` is therefore both cheaper (no network round trip per toggle,
 * no re-pagination) and *safe*, which is the property that actually matters
 * here: the layout engine maps a parent that is absent from the input to a
 * sentinel vertex and BREAKS the line rather than drawing it to nowhere. A
 * filtered subset consequently produces no dangling segments and no stale
 * lanes — the lane count and canvas width simply shrink to fit. That behavior
 * is pinned by tests rather than assumed.
 *
 * ## Reachability, not membership
 *
 * Selecting `feature` means "the history reachable from `feature`", which
 * includes its ancestors and anything merged into it. That is what every git
 * client shows, and it is why filtering by a branch can legitimately display
 * commits that carry another branch's ref: once `feature` was merged into
 * `main`, those commits ARE part of `main`'s history.
 *
 * A commit whose parents are not all in the current page is reachable-checked
 * as far as the page goes. The walk stops at the page boundary rather than
 * treating the missing parent as "not reachable", so a paged graph filters
 * consistently with what is on screen.
 */

import type { GitGraphCommit, GitGraphRefKind } from './types.ts'

/** How a facet value was matched. */
export type FacetKind = 'branch' | 'remote' | 'tag' | 'author'

/** One selectable value in the filter panel. */
export interface FacetOption {
  /** Stable id: `branch:main`, `author:Ada`, `tag:v1`. */
  id: string
  /** Display text (the branch/author/tag name). */
  label: string
  /** Which dimension this value belongs to. */
  kind: FacetKind
  /** How many commits in the CURRENT page carry this value. */
  count: number
}

/** The active selection. Empty arrays mean "no constraint on this dimension". */
export interface GraphFilter {
  /** Selected branch names, local and remote together. */
  branches: readonly string[]
  /** Selected tag names. */
  tags: readonly string[]
  /** Selected author names. */
  authors: readonly string[]
}

/** The neutral selection: everything shown. */
export const EMPTY_FILTER: GraphFilter = Object.freeze({
  branches: [],
  tags: [],
  authors: [],
})

/**
 * Whether a filter constrains anything.
 * @param filter - the selection to test.
 * @returns true when at least one dimension is active.
 */
export function isFilterActive(filter: GraphFilter): boolean {
  return filter.branches.length > 0 || filter.tags.length > 0 || filter.authors.length > 0
}

/**
 * Collect the selectable values present in one page of commits.
 *
 * Counts are per-page by design: the panel offers what the user can actually
 * see, and a branch whose commits all sit on a later page would otherwise
 * appear as a choice that filters to nothing.
 * @param commits - the loaded commits.
 * @returns branch (local then remote), tag, and author options.
 */
export function collectFacets(commits: readonly GitGraphCommit[]): FacetOption[] {
  const counts = new Map<string, FacetOption>()

  const bump = (kind: FacetKind, name: string): void => {
    const id = `${kind}:${name}`
    const existing = counts.get(id)
    if (existing === undefined) counts.set(id, { id, label: name, kind, count: 1 })
    else existing.count += 1
  }

  for (const commit of commits) {
    for (const ref of commit.refs) {
      // `head` is a pointer, not a facet — filtering by it would be filtering
      // by "wherever HEAD happens to be", which the branch selection already
      // expresses.
      if (ref.kind === 'branch') bump('branch', ref.name)
      else if (ref.kind === 'remote') bump('remote', ref.name)
      else if (ref.kind === 'tag') bump('tag', ref.name)
    }
    if (commit.authorName !== null && commit.authorName !== '') bump('author', commit.authorName)
  }

  // Stable, readable order: branches before remotes before tags before authors,
  // each alphabetical. A count-descending sort would reshuffle the list every
  // time a page loads, which makes the panel hard to use.
  const order: Record<FacetKind, number> = { branch: 0, remote: 1, tag: 2, author: 3 }
  return [...counts.values()].sort((a, b) =>
    order[a.kind] - order[b.kind]
    || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}

/**
 * Resolve which commits are reachable from a set of starting hashes, walking
 * `parents` within the loaded page.
 *
 * The walk is iterative rather than recursive: history depth is unbounded and a
 * deep linear repository would otherwise be a stack-overflow risk.
 * @param commits - the loaded commits (the walk cannot leave them).
 * @param roots - hashes to start from.
 * @returns the reachable hash set.
 */
export function reachableFrom(
  commits: readonly GitGraphCommit[],
  roots: Iterable<string>,
): Set<string> {
  const byHash = new Map(commits.map(commit => [commit.hash, commit]))
  const seen = new Set<string>()
  const stack: string[] = []
  for (const root of roots) stack.push(root)

  while (stack.length > 0) {
    const hash = stack.pop()
    if (hash === undefined || seen.has(hash)) continue
    seen.add(hash)
    const commit = byHash.get(hash)
    // A parent outside the page simply ends this branch of the walk; it is not
    // evidence that the commit is unreachable.
    if (commit === undefined) continue
    for (const parent of commit.parents) stack.push(parent)
  }
  return seen
}

/**
 * The tips of the selected branches.
 *
 * A branch is selected by NAME, but reachability needs a starting commit.
 * `tips` is the map the host resolves with `for-each-ref` (see the `tips`
 * method), and it is the ONLY reliable source: `git log --decorate` prints a
 * ref name only on the commit it points at, so in a paginated graph the tip of
 * a branch is frequently not decorated on any loaded commit. A client that
 * looked for a decoration would find nothing and filter to an empty graph.
 *
 * Falling back to decorations is still useful for a locally known ref the host
 * map has not answered for yet (or when the tips request failed): the decorated
 * commit IS the tip when it is present.
 * @param commits - the loaded commits.
 * @param branchNames - selected branch names.
 * @param tips - short ref name → object id, from the host.
 * @returns the tip hashes found, deduplicated.
 */
export function branchTipHashes(
  commits: readonly GitGraphCommit[],
  branchNames: readonly string[],
  tips: Readonly<Record<string, string>> = {},
): string[] {
  if (branchNames.length === 0) return []
  const found = new Set<string>()
  const loaded = new Set(commits.map(commit => commit.hash))

  for (const name of branchNames) {
    const resolved = tips[name]
    // Only a tip that is actually loaded is usable as a walk root; a hash
    // outside the page would make `reachableFrom` return nothing.
    if (resolved !== undefined && loaded.has(resolved)) {
      found.add(resolved)
      continue
    }
    // Fall back to the decoration, which marks the tip when it is on this page.
    for (const commit of commits) {
      if (commit.refs.some(ref => (ref.kind === 'branch' || ref.kind === 'remote') && ref.name === name)) {
        found.add(commit.hash)
        break
      }
    }
  }
  return [...found]
}

/**
 * Whether one commit passes the active filter.
 *
 * Dimensions combine with AND (a commit must satisfy every active dimension),
 * while values WITHIN a dimension combine with OR (any selected branch). That
 * is the conventional reading of a facet panel and the only one that makes
 * "main + feature" and "Ada, in main" both expressible.
 *
 * Branch matching is by reachability, so it needs the reachable set computed
 * once per filter change rather than per commit — hence the precomputed
 * `context` argument.
 * @param commit - the commit to test.
 * @param filter - the active selection.
 * @param context - the precomputed reachable set for the selected branches.
 * @returns true when the commit should be shown.
 */
export function commitMatches(
  commit: GitGraphCommit,
  filter: GraphFilter,
  context: { reachable: Set<string> },
): boolean {
  if (filter.branches.length > 0) {
    if (!context.reachable.has(commit.hash)) return false
  }

  if (filter.tags.length > 0) {
    const tags = new Set(filter.tags)
    const has = commit.refs.some(ref => ref.kind === 'tag' && tags.has(ref.name))
    if (!has) return false
  }

  if (filter.authors.length > 0) {
    if (commit.authorName === null || !filter.authors.includes(commit.authorName)) return false
  }

  return true
}

/**
 * Apply a filter to one page of commits.
 *
 * Returns the SAME array instance when the filter is inactive, so the pane's
 * `useMemo` on `commits` does not invalidate and the layout is not recomputed
 * for a no-op.
 * @param commits - the loaded commits.
 * @param filter - the active selection.
 * @param tips - short ref name → object id, from the host `tips` method.
 * @returns the visible commits, in the original order.
 */
export function filterCommits(
  commits: readonly GitGraphCommit[],
  filter: GraphFilter,
  tips: Readonly<Record<string, string>> = {},
): readonly GitGraphCommit[] {
  if (!isFilterActive(filter)) return commits
  const context = {
    reachable: reachableFrom(commits, branchTipHashes(commits, filter.branches, tips)),
  }
  return commits.filter(commit => commitMatches(commit, filter, context))
}

/**
 * Toggle one facet value inside a filter, returning a new filter.
 *
 * Immutable so React state comparison works, and so a caller cannot mutate a
 * filter that another component is rendering from.
 * @param filter - the current selection.
 * @param option - the facet value to toggle.
 * @returns the updated selection.
 */
export function toggleFacet(filter: GraphFilter, option: FacetOption): GraphFilter {
  const key = option.kind === 'branch' || option.kind === 'remote'
    ? 'branches'
    : option.kind === 'tag' ? 'tags' : 'authors'
  const current = filter[key]
  const next = current.includes(option.label)
    ? current.filter(value => value !== option.label)
    : [...current, option.label]
  return { ...filter, [key]: next }
}

/**
 * Whether a facet value is currently selected.
 * @param filter - the current selection.
 * @param option - the facet value to test.
 * @returns true when selected.
 */
export function isFacetSelected(filter: GraphFilter, option: FacetOption): boolean {
  const key = option.kind === 'branch' || option.kind === 'remote'
    ? 'branches'
    : option.kind === 'tag' ? 'tags' : 'authors'
  return filter[key].includes(option.label)
}

/** Total number of selected values across every dimension. */
export function selectedCount(filter: GraphFilter): number {
  return filter.branches.length + filter.tags.length + filter.authors.length
}

/** Re-exported so callers need not reach into the wire types for the kind. */
export type { GitGraphRefKind }
