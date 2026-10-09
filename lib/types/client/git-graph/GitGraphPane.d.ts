/**
 * Commit-graph pane: SVG lane graph + aligned commit rows.
 * Layout algorithm ported from ZCode's packages/ui git-graph; styling uses
 * `--dsw-*` tokens so it matches the DSH shell without Tailwind.
 *
 * Width follows the dialog (min 500px via dialogStyles); the table drops the
 * date/author columns under 720px viewport so the description stays readable.
 */
import { type ReactNode } from 'react';
import { type GitGraphCommit } from './layout.ts';
import { type GraphFilter } from './filter.ts';
export interface GitGraphPaneProps {
    commits: readonly GitGraphCommit[];
    hasMore?: boolean;
    loadingMore?: boolean;
    selectedCommitHash: string | null;
    onSelectCommit: (hash: string | null) => void;
    onLoadMore?: () => void;
    /**
     * The active facet selection. Owned by the CALLER rather than by this pane,
     * because the same filter must survive a pane remount (the graph view
     * re-renders when the session's branch store notifies).
     */
    filter?: GraphFilter;
    /** Receives the next selection when a facet is toggled. */
    onFilterChange?: (next: GraphFilter) => void;
    /** Short ref name -> object id, used to resolve a branch selection to a walk root. */
    refTips?: Readonly<Record<string, string>>;
    labels: {
        empty: string;
        loadMore: string;
        loadingMore: string;
        graph: string;
        description: string;
        date: string;
        author: string;
        commit: string;
        /** Filter chrome; omitted entirely when the caller supplies no filter. */
        filter?: {
            trigger: string;
            branches: string;
            localBranches: string;
            remoteBranches: string;
            tags: string;
            authors: string;
            clear: string;
            empty: string;
            none: string;
            active: (n: number) => string;
            shown: (shown: number, total: number) => string;
            /** Shown when the filter hides every commit. */
            noMatches: string;
        };
    };
}
/**
 * Render the graph + commit table.
 * @param props - commits and interaction callbacks.
 * @returns the pane.
 */
export declare function GitGraphPane({ commits, hasMore, loadingMore, selectedCommitHash, onSelectCommit, onLoadMore, filter, onFilterChange, refTips, labels, }: GitGraphPaneProps): ReactNode;
