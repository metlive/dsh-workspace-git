/**
 * Reject branch names that could be mistaken for git options or pathspecs.
 * @param branch - the short local branch name from the client.
 * @throws WorkspaceGitError when the name is not safe to pass to git.
 */
export declare function assertSafeBranchName(branch: string): void;
/**
 * Checkout `branch` in the repository containing `path`.
 * @param path - absolute workspace path.
 * @param branch - short local branch name.
 * @returns the branch that is now checked out.
 * @throws WorkspaceGitError when the path is not a repo or git rejects the switch.
 */
export declare function checkoutBranch(path: string, branch: string): Promise<{
    branch: string;
}>;
