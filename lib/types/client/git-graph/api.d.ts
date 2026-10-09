import type { GitCommitDetail, GitGraphResult } from './types.ts';
export type { GitGraphResult, GitGraphCommit, GitGraphRef, GitCommitDetail } from './types.ts';
/**
 * Fetch one page of commits for the graph dialog.
 */
export declare function fetchCommitGraph(path: string, maxCount?: number, skip?: number, signal?: AbortSignal): Promise<GitGraphResult>;
/**
 * Resolve every branch/tag tip of one repository.
 *
 * Needed by the branch filter: the graph is paginated and `--decorate` names a
 * ref only on the commit it points at, so the tip of a selected branch is often
 * absent from the loaded commits. Without this map, filtering by such a branch
 * would resolve to no walk root and show an empty graph.
 * @param path - absolute workspace path.
 * @param signal - optional abort.
 * @returns short ref name -> object id (empty for a non-repository).
 */
export declare function fetchRefTips(path: string, signal?: AbortSignal): Promise<Record<string, string>>;
/**
 * Fetch one commit's detail for the right-hand panel.
 * @param path - absolute workspace path.
 * @param hash - full commit hash.
 * @param signal - optional abort.
 */
export declare function fetchCommitDetail(path: string, hash: string, signal?: AbortSignal): Promise<GitCommitDetail>;
