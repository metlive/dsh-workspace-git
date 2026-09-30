import type { GitCommitDetail, GitGraphResult } from './types.ts';
export type { GitGraphResult, GitGraphCommit, GitGraphRef, GitCommitDetail } from './types.ts';
/**
 * Fetch one page of commits for the graph dialog.
 */
export declare function fetchCommitGraph(path: string, maxCount?: number, skip?: number, signal?: AbortSignal): Promise<GitGraphResult>;
/**
 * Fetch one commit's detail for the right-hand panel.
 * @param path - absolute workspace path.
 * @param hash - full commit hash.
 * @param signal - optional abort.
 */
export declare function fetchCommitDetail(path: string, hash: string, signal?: AbortSignal): Promise<GitCommitDetail>;
