import type { GitRefKind } from './git-ref.ts';
/**
 * Reject branch names that could be mistaken for git options or pathspecs.
 * @param branch - the short local or remote-tracking name from the client.
 * @throws WorkspaceGitError when the name is not safe to pass to git.
 */
export declare function assertSafeBranchName(branch: string): void;
/**
 * Local short name implied by a remote-tracking ref (`origin/feature/x` →
 * `feature/x`). Returns undefined when the name has no remote prefix.
 * @param remoteRef - e.g. `origin/main`.
 */
export declare function localNameFromRemote(remoteRef: string): string | undefined;
/**
 * Checkout `branch` in the repository containing `path`.
 *
 * When `kind` is `remote`, uses `git switch --track` (or switches to an
 * existing local branch of the same short name) so HEAD stays on a local
 * branch. Otherwise runs a plain `git switch`.
 * @param path - absolute workspace path.
 * @param branch - short local name, or `remote/branch` for tracking refs.
 * @param kind - optional explicit kind from the menu row.
 * @returns the local branch that is now checked out.
 * @throws WorkspaceGitError when the path is not a repo or git rejects the switch.
 */
export declare function checkoutBranch(path: string, branch: string, kind?: GitRefKind): Promise<{
    branch: string;
}>;
/**
 * Create `branch` at the current HEAD and check it out (`git switch -c`).
 * @param path - absolute workspace path.
 * @param branch - short local branch name for the new branch.
 * @returns the branch that is now checked out.
 * @throws WorkspaceGitError when the path is not a repo, the name is unsafe,
 *   or git rejects the create (e.g. the branch already exists).
 */
export declare function createBranch(path: string, branch: string): Promise<{
    branch: string;
}>;
/** One uncommitted entry, as the switch guard reports it. */
export interface WorkTreeChange {
    /** Path relative to the work-tree root, POSIX-separated. */
    path: string;
    /**
     * Two-letter porcelain status (`M `, ` M`, `??`, `D `, `R `, …). The client
     * only needs the first two characters; it renders the label itself.
     */
    status: string;
    /** Whether the file is untracked (`??`), which the UI groups separately. */
    untracked: boolean;
}
/** The work tree's cleanliness, as the switch guard reports it. */
export interface WorkTreeStatus {
    /** Whether the repository root that was inspected. */
    workTree: string;
    /** The branch HEAD is on, or null when detached. */
    branch: string | null;
    /** Uncommitted entries (tracked modifications + untracked files). */
    changes: WorkTreeChange[];
    /**
     * Whether {@link changes} was truncated at {@link MAX_STATUS_ENTRIES}. The UI
     * says "and N more" rather than rendering an unbounded list.
     */
    truncated: boolean;
    /** Total entry count before truncation. */
    total: number;
}
/**
 * Cap on reported entries. A dirty tree can hold tens of thousands of paths
 * (a stray `node_modules`), and this rides a click on a menu row — the dialog
 * only needs to say "this tree is dirty, here is a sample".
 */
export declare const MAX_STATUS_ENTRIES = 200;
/**
 * Read the work tree's uncommitted state, for the pre-switch guard.
 *
 * `git status --porcelain=v1 -z` is the machine-stable form: `-z` NUL-terminates
 * entries and, crucially, does NOT quote or escape paths, so a filename with a
 * space, quote, or newline survives intact. With renames (`R`), `-z` emits the
 * NEW path first and the source second as two separate NUL-terminated fields
 * sharing one status record — the second field MUST be consumed or the parse
 * desynchronises and every later entry is garbage. That consumption is the one
 * subtle part of this function.
 *
 * `--untracked-files=all` lists individual files rather than collapsing a new
 * directory to `dir/`, because the dialog names files the user will recognise.
 *
 * This is a READ. It never mutates the work tree — the guard only informs the
 * user; discarding is an explicit, separate action.
 *
 * @param path - absolute workspace path (the repository may be an ancestor).
 * @returns the status, or `changes: []` for a clean tree.
 * @throws WorkspaceGitError when the path is not a repository or git fails.
 */
export declare function workTreeStatus(path: string): Promise<WorkTreeStatus>;
