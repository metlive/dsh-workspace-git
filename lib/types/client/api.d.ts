/**
 * Typed fetch wrapper over the plugin's own `/workspace-git/api` route.
 *
 * Every call posts a batch of absolute workspace paths and receives a per-path
 * answer map. Failures surface as {@link WorkspaceGitApiError} — but callers
 * are expected to swallow them: the plugin's contract is that a failed lookup
 * renders nothing, never an error (see the header chip and the README).
 */
/** One wire failure. */
export declare class WorkspaceGitApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** One branch answer as the wire carries it. */
export interface BranchAnswer {
    /** The branch name, a short id when detached, or null when there is none. */
    branch: string | null;
    /** Whether HEAD is detached. */
    detached: boolean;
}
/** The result of one batch lookup. */
export interface BranchesResult {
    branches: Record<string, BranchAnswer>;
}
/** One branch row of the menu. */
export interface RefAnswer {
    /** The short branch name. */
    name: string;
    /** Whether HEAD currently points at it. */
    current: boolean;
}
/** The result of one branch-list lookup. */
export interface RefsResult {
    /** Whether HEAD is detached (the list is still shown; no row is current). */
    detached: boolean;
    /** The sorted local branch names. */
    refs: RefAnswer[];
}
/**
 * Resolve the branch of each given workspace path.
 *
 * An empty path list short-circuits without a request — the common case on a
 * page with no workspaces, and it keeps the caller free of a special case.
 * @param paths - absolute workspace directories.
 * @param signal - abort signal; an aborted request rejects with the DOMException.
 * @returns the per-path answer map.
 */
export declare function fetchBranches(paths: readonly string[], signal?: AbortSignal): Promise<BranchesResult>;
/**
 * Resolve the local branch list of one repository.
 *
 * Called only when the menu opens — the list is not needed to draw the closed
 * trigger, and a repository can hold hundreds of branches.
 * @param path - the absolute workspace directory.
 * @param signal - abort signal; an aborted request rejects with the DOMException.
 * @returns the branch list (empty for a directory that is not a repository).
 */
export declare function fetchRefs(path: string, signal?: AbortSignal): Promise<RefsResult>;
/** The result of one checkout. */
export interface CheckoutResult {
    /** The branch that is now checked out. */
    branch: string;
}
/**
 * Switch the work tree at `path` to the given local branch.
 * @param path - the absolute workspace directory.
 * @param branch - short local branch name.
 * @param signal - abort signal.
 * @returns the branch now checked out.
 */
export declare function checkoutBranch(path: string, branch: string, signal?: AbortSignal): Promise<CheckoutResult>;
