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
