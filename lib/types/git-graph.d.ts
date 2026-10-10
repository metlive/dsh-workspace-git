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
/** Tip maps for graph filtering: all refs for resolution, branches for the dropdown. */
export interface RefTipsSnapshot {
    /** Short ref name → object id for heads, remotes, and tags. */
    tips: Record<string, string>;
    /** Short ref name → object id for local and remote-tracking branches only. */
    branches: Record<string, string>;
}
/**
 * Resolve every branch and tag tip to its object id, for one repository.
 *
 * Why this exists: `git log --decorate` prints a ref name ONLY on the commit it
 * points at. The graph is paginated, so a branch whose tip lies on a later page
 * carries no decoration in the loaded commits — and a client that resolved
 * branches by looking for a decoration would find nothing and filter to an
 * empty graph. This map lets the client resolve a selected branch name to its
 * tip hash regardless of which page is loaded.
 *
 * Local branches, remote-tracking branches, and tags are all included in
 * `tips`. `branches` is the heads+remotes subset used to populate the graph's
 * branch dropdown without listing tags. The keys are the short names the UI
 * shows (`main`, `origin/main`, `v1`), which is the same spelling `--decorate`
 * produces, so the two agree.
 *
 * A repository with no refs yields empty maps rather than an error.
 * @param path - absolute workspace path.
 * @returns tip maps keyed by short ref name.
 */
export declare function fetchRefTips(path: string): Promise<RefTipsSnapshot>;
/**
 * Fetch one page of the commit graph for the repository containing `path`.
 * @param path - absolute workspace path.
 * @param maxCount - page size (default 50, max 200).
 * @param skip - how many commits to skip.
 * @returns commits plus whether another page exists; empty when not a repo.
 */
export declare function fetchCommitGraph(path: string, maxCount?: number, skip?: number): Promise<GitGraphSnapshot>;
