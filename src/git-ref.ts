/**
 * Pure `.git` ref parsing — the whole branch-detection brain of this plugin,
 * deliberately free of `node:fs` so it is unit-testable without a repository.
 *
 * Why parse the files instead of shelling out to `git`:
 * - no subprocess means no shell, no PATH lookup, no argument quoting surface,
 *   and no sandbox/approval prompt on every poll;
 * - reading `HEAD` is exactly what `git rev-parse --abbrev-ref HEAD` reads for
 *   the common case, and it is O(1) instead of O(repo).
 *
 * The tradeoff (documented in the README): a ref written by a newer git that
 * this parser does not understand yields `undefined`, i.e. "no branch shown" —
 * never a wrong branch and never an error surface.
 */

/** A `ref: refs/heads/<name>` line. Git writes the ref name verbatim after the prefix. */
const HEAD_REF = /^ref:\s+(.+?)\s*$/

/** The `gitdir: <path>` line of a `.git` FILE (linked worktree / submodule). */
const GITDIR_POINTER = /^gitdir:\s*(.+?)\s*$/

/** A raw object id: 40 hex (SHA-1) or 64 hex (SHA-256 repositories). */
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i

/** How many hex characters of a detached HEAD to show. */
export const SHORT_ID_LENGTH = 7

/**
 * The branch of one repository, as the UI needs it.
 *
 * `detached` is reported rather than hidden: a detached HEAD is a real,
 * common state (bisect, tag checkout, CI) and showing the short id is more
 * useful than showing nothing. It is NOT a failure.
 */
export interface GitHead {
  /** The display string: a branch name, or a short object id when detached. */
  readonly branch: string
  /** Whether HEAD points at an object rather than a branch. */
  readonly detached: boolean
}

/**
 * Strip the `refs/heads/` prefix from a full ref name.
 *
 * `refs/heads/feature/x` → `feature/x`; anything else (a remote ref, a tag, a
 * bare ref) is returned unchanged, because those are already the most useful
 * spelling of themselves.
 * @param ref - the full ref name from `HEAD`.
 * @returns the display name.
 */
export function shortRefName(ref: string): string {
  const heads = 'refs/heads/'
  return ref.startsWith(heads) ? ref.slice(heads.length) : ref
}

/**
 * Parse the contents of a repository's `HEAD` file.
 *
 * Handles the two shapes git writes:
 * - `ref: refs/heads/main` — the ordinary symbolic ref (also `refs/remotes/…`
 *   in the odd case of a checked-out remote ref);
 * - a raw object id — a detached HEAD, shown as its short id.
 *
 * Anything else (empty file, a corrupt ref, an unborn branch spelled in a way
 * this parser does not know) returns `undefined`, which the callers render as
 * "no branch" rather than as an error.
 * @param headText - the raw `HEAD` file contents.
 * @returns the parsed head, or undefined when it is not a shape we understand.
 */
export function parseHead(headText: string): GitHead | undefined {
  const text = headText.trim()
  if (text === '') return undefined

  const ref = HEAD_REF.exec(text)
  if (ref !== null) {
    const name = shortRefName(ref[1] ?? '')
    // `ref: refs/heads/` with nothing after it is a malformed HEAD, not a
    // branch literally named "".
    return name === '' ? undefined : { branch: name, detached: false }
  }

  if (OBJECT_ID.test(text)) {
    return { branch: text.slice(0, SHORT_ID_LENGTH), detached: true }
  }

  return undefined
}

/**
 * Parse a `.git` FILE (the pointer git writes for linked worktrees and
 * submodules, whose real git directory lives elsewhere).
 * @param pointerText - the raw `.git` file contents.
 * @returns the git directory it points at, or undefined.
 */
export function parseGitDirPointer(pointerText: string): string | undefined {
  const match = GITDIR_POINTER.exec(pointerText.trim())
  const target = match?.[1]?.trim()
  return target === undefined || target === '' ? undefined : target
}

/**
 * Pick the branch to display when several repositories are in play.
 *
 * Only the first is ever used today (one workspace = one repository), but the
 * rule is stated once here so callers cannot drift: a real branch beats a
 * detached id, because the branch name carries more information.
 * @param heads - candidate heads in discovery order.
 * @returns the head to show, or undefined when there are none.
 */
export function preferBranch(heads: readonly (GitHead | undefined)[]): GitHead | undefined {
  let detached: GitHead | undefined
  for (const head of heads) {
    if (head === undefined) continue
    if (!head.detached) return head
    detached ??= head
  }
  return detached
}

/** Whether a listed ref is a local branch or a remote-tracking branch. */
export type GitRefKind = 'local' | 'remote'

/**
 * One candidate name before merge/sort — from a loose ref file or packed-refs.
 *
 * `mtimeMs` is only known for loose refs (the file's mtime); packed entries
 * omit it and sort after any same-kind entry that has a stamp.
 */
export interface GitRefCandidate {
  /** Display name: local short name, or `origin/feature` for remotes. */
  readonly name: string
  /** Local vs remote-tracking. */
  readonly kind: GitRefKind
  /** Loose-ref file mtime in ms, when known. */
  readonly mtimeMs?: number
}

/** One entry of a repository's ref list. */
export interface GitRefEntry {
  /** The short branch name, as it should be displayed. */
  readonly name: string
  /** Local vs remote-tracking. */
  readonly kind: GitRefKind
  /** Whether this is the branch HEAD currently points at. */
  readonly current: boolean
}

/**
 * Whether a remote-tracking name is the remote's symbolic HEAD (`origin/HEAD`),
 * which is not useful in a branch picker.
 * @param name - the name under `refs/remotes/` (e.g. `origin/HEAD`).
 */
export function isRemoteHeadRef(name: string): boolean {
  return name === 'HEAD' || name.endsWith('/HEAD')
}

/**
 * Extract local and remote-tracking branch names from a `packed-refs` file.
 *
 * `packed-refs` is git's compaction of `refs/` into one file: a header line
 * (`# pack-refs with: …`), optional `^<sha>` peeled-tag lines that belong to the
 * line above them, and `<sha> <refname>` rows. Tags are ignored; remote
 * symbolic HEAD refs (names ending in `/HEAD`) are skipped.
 *
 * A loose ref file always overrides its packed entry, so the caller merges the
 * two — but for LISTING purposes a duplicate name is harmless and de-duplication
 * happens in {@link mergeRefNames}.
 * @param text - the raw `packed-refs` contents.
 * @returns the candidates found, in file order.
 */
export function parsePackedRefs(text: string): GitRefCandidate[] {
  const heads = 'refs/heads/'
  const remotes = 'refs/remotes/'
  const out: GitRefCandidate[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    // Header, blank lines, and peeled-tag markers carry no ref name.
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('^')) continue
    const space = trimmed.indexOf(' ')
    if (space === -1) continue
    const ref = trimmed.slice(space + 1).trim()
    if (ref.startsWith(heads)) {
      const name = ref.slice(heads.length)
      if (name !== '') out.push({ name, kind: 'local' })
      continue
    }
    if (ref.startsWith(remotes)) {
      const name = ref.slice(remotes.length)
      if (name !== '' && !isRemoteHeadRef(name)) out.push({ name, kind: 'remote' })
    }
  }
  return out
}

/**
 * Merge loose and packed ref candidates into one display list.
 *
 * Loose refs win on duplicates (they are the newer spelling). Within each
 * kind, entries sort by loose mtime descending (most recently touched first),
 * then by name — so the menu's default "recent" window is stable and useful.
 * Locals are listed before remotes in the flat array; the UI groups them.
 *
 * The current local branch is flagged rather than force-reordered: the client
 * keeps it visible when truncating to the recent window.
 * @param loose - candidates from loose ref files (may carry mtime).
 * @param packed - candidates from `packed-refs`.
 * @param current - the checked-out local branch name, when HEAD is not detached.
 * @returns the de-duplicated, sorted list.
 */
export function mergeRefNames(
  loose: readonly GitRefCandidate[],
  packed: readonly GitRefCandidate[],
  current: string | undefined,
): GitRefEntry[] {
  const keyOf = (kind: GitRefKind, name: string): string => `${kind}\0${name}`
  const seen = new Set<string>()
  const merged: GitRefCandidate[] = []
  for (const entry of [...loose, ...packed]) {
    if (entry.name === '') continue
    const key = keyOf(entry.kind, entry.name)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(entry)
  }
  merged.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'local' ? -1 : 1
    const ma = a.mtimeMs ?? 0
    const mb = b.mtimeMs ?? 0
    if (ma !== mb) return mb - ma
    return a.name.localeCompare(b.name)
  })
  return merged.map(entry => ({
    name: entry.name,
    kind: entry.kind,
    current: entry.kind === 'local' && entry.name === current,
  }))
}

