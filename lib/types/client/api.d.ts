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
/** Whether a listed ref is a local branch or a remote-tracking branch. */
export type RefKind = 'local' | 'remote';
/** One branch row of the menu. */
export interface RefAnswer {
    /** The short branch name (`main`) or remote-tracking name (`origin/main`). */
    name: string;
    /** Whether HEAD currently points at it (only ever true for local refs). */
    current: boolean;
    /** Local vs remote-tracking — drives menu grouping. */
    kind: RefKind;
}
/** The result of one branch-list lookup. */
export interface RefsResult {
    /** Whether HEAD is detached (the list is still shown; no row is current). */
    detached: boolean;
    /** Recent-sorted refs (locals first, then remotes). */
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
 * Resolve the local + remote branch list of one repository.
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
 * Switch the work tree at `path` to the given branch.
 *
 * When `kind` is `remote`, the host creates or reuses a local tracking branch
 * (`git switch --track`). Otherwise it runs a plain `git switch`.
 * @param path - the absolute workspace directory.
 * @param branch - short local name, or `remote/branch` for tracking refs.
 * @param kind - local vs remote-tracking (defaults to local).
 * @param signal - abort signal.
 * @returns the local branch now checked out.
 */
export declare function checkoutBranch(path: string, branch: string, kind?: RefKind, signal?: AbortSignal): Promise<CheckoutResult>;
/**
 * Create `branch` at HEAD and check it out in the work tree at `path`.
 * @param path - the absolute workspace directory.
 * @param branch - short local branch name for the new branch.
 * @param signal - abort signal.
 * @returns the branch now checked out.
 */
export declare function createBranch(path: string, branch: string, signal?: AbortSignal): Promise<CheckoutResult>;
/** The `enhance-prompt` result: the rewrite plus the route that produced it. */
export interface PromptEnhanceResult {
    /** The rewritten prompt, ready to replace the draft. */
    draft: string;
    /** Provider that answered (diagnostics only). */
    provider: string;
    /** Model that answered (diagnostics only). */
    model: string;
}
/**
 * Rewrite one composer draft through the session's own model.
 *
 * Unlike the git lookups, a failure here is NOT silent: the caller shows the
 * reason, because the user explicitly asked for this and needs to know why
 * nothing happened.
 * @param sessionId - the session whose model performs the rewrite.
 * @param draft - the current composer text.
 * @param signal - abort signal; an in-flight enhancement is cancelled with it.
 * @returns the rewrite.
 * @throws WorkspaceGitApiError carrying a machine code the caller can explain.
 */
export declare function enhancePrompt(sessionId: string, draft: string, signal?: AbortSignal): Promise<PromptEnhanceResult>;
