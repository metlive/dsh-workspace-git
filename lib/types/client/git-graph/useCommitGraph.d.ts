import type { GitGraphCommit } from './types.ts';
export interface UseCommitGraphResult {
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    commits: GitGraphCommit[];
    hasMore: boolean;
    selected: string | null;
    setSelected: (hash: string | null) => void;
    loadMore: () => void;
    reload: () => void;
}
/**
 * Load and paginate the commit graph for one workspace path.
 * @param cwd - absolute workspace path.
 * @param enabled - when false, skip fetch and ignore in-flight results.
 * @returns graph load state and actions.
 */
export declare function useCommitGraph(cwd: string, enabled: boolean): UseCommitGraphResult;
