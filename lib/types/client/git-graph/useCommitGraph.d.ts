import type { GitGraphCommit } from './types.ts';
export interface UseCommitGraphResult {
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    commits: GitGraphCommit[];
    hasMore: boolean;
    /**
     * Short ref name -> object id for every branch and tag in the repository.
     *
     * Owned here because it is repository state loaded alongside the first page,
     * and because the filter needs it to resolve a selected branch to a walk root
     * even when that branch's tip is not among the loaded commits. An empty map is
     * a valid answer (not a repository, or the request failed): the filter then
     * falls back to ref decorations, which cover the tips that ARE loaded.
     */
    refTips: Record<string, string>;
    /**
     * Short ref name -> object id for local and remote-tracking branches only.
     * Populates the branch filter dropdown without listing tags.
     */
    branchTips: Record<string, string>;
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
export declare function useCommitGraph(cwd: string, enabled: boolean, branchKey?: string): UseCommitGraphResult;
