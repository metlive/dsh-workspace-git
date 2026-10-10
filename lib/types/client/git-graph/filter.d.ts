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
import type { GitGraphCommit, GitGraphRefKind } from './types.ts';
/** How a facet value was matched. */
export type FacetKind = 'branch' | 'remote' | 'tag' | 'author';
/** One selectable value in the filter panel. */
export interface FacetOption {
    /** Stable id: `branch:main`, `author:Ada`, `tag:v1`. */
    id: string;
    /** Display text (the branch/author/tag name). */
    label: string;
    /** Which dimension this value belongs to. */
    kind: FacetKind;
    /** How many commits in the CURRENT page carry this value. */
    count: number;
}
/** The active selection. Empty arrays mean "no constraint on this dimension". */
export interface GraphFilter {
    /** Selected branch names, local and remote together. */
    branches: readonly string[];
    /** Selected tag names. */
    tags: readonly string[];
    /** Selected author names. */
    authors: readonly string[];
}
/** The neutral selection: everything shown. */
export declare const EMPTY_FILTER: GraphFilter;
/**
 * Whether a filter constrains anything.
 * @param filter - the selection to test.
 * @returns true when at least one dimension is active.
 */
export declare function isFilterActive(filter: GraphFilter): boolean;
/**
 * Collect the selectable values present in one page of commits.
 *
 * Author counts are per-page by design: the dropdown offers authors the user
 * can actually see. Branches additionally merge in every short name from the
 * host `tips` map so the branch dropdown lists the whole repository, not only
 * the tips that happen to be decorated on the current page.
 * @param commits - the loaded commits.
 * @param tips - short ref name → object id, from the host `tips` method.
 * @returns branch (local then remote), tag, and author options.
 */
export declare function collectFacets(commits: readonly GitGraphCommit[], tips?: Readonly<Record<string, string>>): FacetOption[];
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
export declare function reachableFrom(commits: readonly GitGraphCommit[], roots: Iterable<string>): Set<string>;
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
export declare function branchTipHashes(commits: readonly GitGraphCommit[], branchNames: readonly string[], tips?: Readonly<Record<string, string>>): string[];
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
export declare function commitMatches(commit: GitGraphCommit, filter: GraphFilter, context: {
    reachable: Set<string>;
}): boolean;
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
export declare function filterCommits(commits: readonly GitGraphCommit[], filter: GraphFilter, tips?: Readonly<Record<string, string>>): readonly GitGraphCommit[];
/**
 * Toggle one facet value inside a filter, returning a new filter.
 *
 * Immutable so React state comparison works, and so a caller cannot mutate a
 * filter that another component is rendering from.
 * @param filter - the current selection.
 * @param option - the facet value to toggle.
 * @returns the updated selection.
 */
export declare function toggleFacet(filter: GraphFilter, option: FacetOption): GraphFilter;
/**
 * Whether a facet value is currently selected.
 * @param filter - the current selection.
 * @param option - the facet value to test.
 * @returns true when selected.
 */
export declare function isFacetSelected(filter: GraphFilter, option: FacetOption): boolean;
/** Total number of selected values across every dimension. */
export declare function selectedCount(filter: GraphFilter): number;
/**
 * Set the branch dimension to a single name (or clear it).
 *
 * The toolbar exposes a single-select dropdown, so the selection is always
 * zero or one branch. Tags and authors are left untouched.
 * @param filter - the current selection.
 * @param branch - the short ref name, or `null` / `''` for "all branches".
 * @returns the updated selection.
 */
export declare function setFilterBranch(filter: GraphFilter, branch: string | null): GraphFilter;
/**
 * Set the author dimension to a single name (or clear it).
 * @param filter - the current selection.
 * @param author - the author name, or `null` / `''` for "all authors".
 * @returns the updated selection.
 */
export declare function setFilterAuthor(filter: GraphFilter, author: string | null): GraphFilter;
/** Re-exported so callers need not reach into the wire types for the kind. */
export type { GitGraphRefKind };
