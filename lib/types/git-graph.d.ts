/** Default page size (matches ZCode's UI page). */
export declare const DEFAULT_GRAPH_PAGE_SIZE = 50;
/** Hard cap so a huge repo cannot flood the response. */
export declare const MAX_GRAPH_PAGE_SIZE = 200;
/** One ref decoration on a commit. */
export type GitGraphRefKind = 'branch' | 'remote' | 'tag' | 'head';
/** One ref decoration. */
export interface GitGraphRef {
    name: string;
    kind: GitGraphRefKind;
}
/** One commit of the graph page. */
export interface GitGraphCommit {
    hash: string;
    parents: string[];
    refs: GitGraphRef[];
    subject: string;
    authorName: string | null;
    authoredAtMs: number | null;
}
/** One graph page. */
export interface GitGraphSnapshot {
    commits: GitGraphCommit[];
    hasMore: boolean;
}
/**
 * Walk upward from `startPath` to the work-tree root (directory holding `.git`).
 * @param startPath - absolute workspace path.
 * @returns the work-tree root, or undefined.
 */
export declare function findWorkTree(startPath: string): Promise<string | undefined>;
/**
 * Parse `git log --format=…%x1e` stdout into commit rows.
 * @param stdout - raw git log output.
 * @returns the commits in topo/date order.
 */
export declare function parseGitGraphRecords(stdout: string): GitGraphCommit[];
/**
 * Fetch one page of the commit graph for the repository containing `path`.
 * @param path - absolute workspace path.
 * @param maxCount - page size (default 50, max 200).
 * @param skip - how many commits to skip.
 * @returns commits plus whether another page exists; empty when not a repo.
 */
export declare function fetchCommitGraph(path: string, maxCount?: number, skip?: number): Promise<GitGraphSnapshot>;
