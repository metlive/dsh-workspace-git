import { type BranchCache } from './git-branch.ts';
import { type WorkTreeStatus } from './git-checkout.ts';
import { type GitCommitDetail } from './git-commit-detail.ts';
import { type GitGraphSnapshot } from './git-graph.ts';
import type { GitRefKind } from './git-ref.ts';
import type { Context, PluginHttpRequest, PluginHttpResponse } from './context-types.ts';
/** Route path prefix; the API method is the final segment. */
export declare const API_PREFIX = "/workspace-git/api";
/** One branch answer as the wire carries it. */
export interface BranchAnswer {
    /** The branch name, a short id when detached, or null when there is none. */
    branch: string | null;
    /** Whether HEAD is detached (the client renders those differently). */
    detached: boolean;
}
/** The `branches` method's result. */
export interface BranchesResult {
    branches: Record<string, BranchAnswer>;
}
/** One branch row as the menu consumes it. */
export interface RefAnswer {
    /** The short branch name (`main`) or remote-tracking name (`origin/main`). */
    name: string;
    /** Whether HEAD currently points at it (only ever true for local refs). */
    current: boolean;
    /** Local vs remote-tracking — drives menu grouping. */
    kind: GitRefKind;
}
/** The `refs` method's result: local + remote branches of one repository. */
export interface RefsResult {
    /** Whether HEAD is detached (the list is still shown; no row is current). */
    detached: boolean;
    /** Recent-sorted refs (locals first, then remotes). */
    refs: RefAnswer[];
}
/**
 * Narrow an unknown payload to a bounded list of absolute paths.
 * @param payload - the parsed request body.
 * @returns the validated paths.
 */
export declare function parseBranchesRequest(payload: unknown): string[];
/**
 * Resolve the branch answers for one payload.
 * @param cache - the activation-scoped branch cache.
 * @param payload - the parsed request body.
 * @returns the per-path answer map.
 */
export declare function resolveBranches(cache: BranchCache, payload: unknown): Promise<BranchesResult>;
/**
 * Narrow an unknown payload to the single absolute path the ref list is for.
 * @param payload - the parsed request body.
 * @returns the validated path.
 */
export declare function parseRefsRequest(payload: unknown): string;
/**
 * Resolve the branch list of one repository.
 * @param cache - the activation-scoped branch cache.
 * @param payload - the parsed request body.
 * @returns the branch list (empty for a directory that is not a repository).
 */
export declare function resolveRefs(cache: BranchCache, payload: unknown): Promise<RefsResult>;
/**
 * Narrow a graph request: absolute path plus optional pagination.
 * @param payload - the parsed request body.
 * @returns path / maxCount / skip.
 */
export declare function parseGraphRequest(payload: unknown): {
    path: string;
    maxCount: number;
    skip: number;
};
/**
 * Resolve one page of the commit graph.
 * @param payload - the parsed request body.
 * @returns the graph page.
 */
export declare function resolveGraph(payload: unknown): Promise<GitGraphSnapshot>;
/**
 * Resolve every branch/tag tip of one repository.
 *
 * The graph is paginated and `--decorate` only names a ref on the commit it
 * points at, so the client cannot learn a branch's tip from the commits alone
 * once that tip falls on an unloaded page. Filtering by branch needs the tip, so
 * this is its own method rather than an extra field on the page.
 * @param payload - the parsed request body.
 * @returns short ref name -> object id.
 */
export declare function resolveTips(payload: unknown): Promise<{
    tips: Record<string, string>;
    branches: Record<string, string>;
}>;
/**
 * Narrow a checkout request: absolute path + branch name + optional kind.
 * @param payload - the parsed request body.
 * @returns path, branch, and kind (defaults to local).
 */
export declare function parseCheckoutRequest(payload: unknown): {
    path: string;
    branch: string;
    kind: GitRefKind;
};
/**
 * Switch the work tree to the requested branch and bust the branch cache.
 * @param cache - the activation-scoped branch cache.
 * @param payload - the parsed request body.
 * @returns the branch now checked out.
 */
export declare function resolveCheckout(cache: BranchCache, payload: unknown): Promise<{
    branch: string;
}>;
/**
 * Create and check out a new branch, then bust the branch cache.
 * @param cache - the activation-scoped branch cache.
 * @param payload - the parsed request body.
 * @returns the branch now checked out.
 */
export declare function resolveCreateBranch(cache: BranchCache, payload: unknown): Promise<{
    branch: string;
}>;
/**
 * Read the work tree's uncommitted state for the pre-switch guard.
 *
 * A READ, deliberately separate from `checkout`: the client asks first, shows
 * the user what is dirty, and only then decides whether to switch. Folding the
 * check into the switch would make the guard unobservable — the dialog needs
 * the list BEFORE anything is attempted.
 * @param payload - the parsed request body.
 * @returns the status (an empty `changes` array when the tree is clean).
 */
export declare function resolveStatus(payload: unknown): Promise<WorkTreeStatus>;
/**
 * Narrow a commit-detail request: absolute path + full object id.
 * @param payload - the parsed request body.
 */
export declare function parseCommitRequest(payload: unknown): {
    path: string;
    hash: string;
};
/**
 * Resolve one commit's detail payload for the graph side panel.
 * @param payload - the parsed request body.
 */
export declare function resolveCommit(payload: unknown): Promise<GitCommitDetail>;
/**
 * Build the route handler.
 * @param cache - the activation-scoped branch cache.
 * @param fence - browser-trust predicate.
 * @returns the route handler.
 */
export declare function createApiHandler(cache: BranchCache, fence: (req: PluginHttpRequest) => boolean, ctx: Context): (req: PluginHttpRequest, res: PluginHttpResponse) => Promise<void>;
