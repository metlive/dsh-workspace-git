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
/** How many hex characters of a detached HEAD to show. */
export declare const SHORT_ID_LENGTH = 7;
/**
 * The branch of one repository, as the UI needs it.
 *
 * `detached` is reported rather than hidden: a detached HEAD is a real,
 * common state (bisect, tag checkout, CI) and showing the short id is more
 * useful than showing nothing. It is NOT a failure.
 */
export interface GitHead {
    /** The display string: a branch name, or a short object id when detached. */
    readonly branch: string;
    /** Whether HEAD points at an object rather than a branch. */
    readonly detached: boolean;
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
export declare function shortRefName(ref: string): string;
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
export declare function parseHead(headText: string): GitHead | undefined;
/**
 * Parse a `.git` FILE (the pointer git writes for linked worktrees and
 * submodules, whose real git directory lives elsewhere).
 * @param pointerText - the raw `.git` file contents.
 * @returns the git directory it points at, or undefined.
 */
export declare function parseGitDirPointer(pointerText: string): string | undefined;
/**
 * Pick the branch to display when several repositories are in play.
 *
 * Only the first is ever used today (one workspace = one repository), but the
 * rule is stated once here so callers cannot drift: a real branch beats a
 * detached id, because the branch name carries more information.
 * @param heads - candidate heads in discovery order.
 * @returns the head to show, or undefined when there are none.
 */
export declare function preferBranch(heads: readonly (GitHead | undefined)[]): GitHead | undefined;
/** Whether a listed ref is a local branch or a remote-tracking branch. */
export type GitRefKind = 'local' | 'remote';
/**
 * One candidate name before merge/sort — from a loose ref file or packed-refs.
 *
 * `mtimeMs` is only known for loose refs (the file's mtime); packed entries
 * omit it and sort after any same-kind entry that has a stamp.
 */
export interface GitRefCandidate {
    /** Display name: local short name, or `origin/feature` for remotes. */
    readonly name: string;
    /** Local vs remote-tracking. */
    readonly kind: GitRefKind;
    /** Loose-ref file mtime in ms, when known. */
    readonly mtimeMs?: number;
}
/** One entry of a repository's ref list. */
export interface GitRefEntry {
    /** The short branch name, as it should be displayed. */
    readonly name: string;
    /** Local vs remote-tracking. */
    readonly kind: GitRefKind;
    /** Whether this is the branch HEAD currently points at. */
    readonly current: boolean;
}
/**
 * Whether a remote-tracking name is the remote's symbolic HEAD (`origin/HEAD`),
 * which is not useful in a branch picker.
 * @param name - the name under `refs/remotes/` (e.g. `origin/HEAD`).
 */
export declare function isRemoteHeadRef(name: string): boolean;
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
export declare function parsePackedRefs(text: string): GitRefCandidate[];
/**
 * Merge loose and packed ref candidates into one display list.
 *
 * Loose refs win on duplicates (they are the newer spelling). Within each
 * kind, entries sort by loose mtime descending (most recently touched first),
 * then by name. Packed entries carry no mtime and are treated as 0, so they
 * trail every stamped sibling and end up in name order — meaning the menu's
 * default window is "most recent" only for loose refs, and degrades to
 * "first by name" once `git pack-refs` has compacted the repository.
 * Locals are listed before remotes in the flat array; the UI groups them.
 *
 * The current local branch is flagged rather than force-reordered: the client
 * keeps it visible when truncating to the default window.
 * @param loose - candidates from loose ref files (may carry mtime).
 * @param packed - candidates from `packed-refs`.
 * @param current - the checked-out local branch name, when HEAD is not detached.
 * @returns the de-duplicated, sorted list.
 */
export declare function mergeRefNames(loose: readonly GitRefCandidate[], packed: readonly GitRefCandidate[], current: string | undefined): GitRefEntry[];
