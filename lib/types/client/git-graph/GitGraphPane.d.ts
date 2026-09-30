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
export interface GitGraphPaneProps {
    commits: readonly GitGraphCommit[];
    hasMore?: boolean;
    loadingMore?: boolean;
    selectedCommitHash: string | null;
    onSelectCommit: (hash: string | null) => void;
    onLoadMore?: () => void;
    labels: {
        empty: string;
        loadMore: string;
        loadingMore: string;
        graph: string;
        description: string;
        date: string;
        author: string;
        commit: string;
    };
}
/**
 * Render the graph + commit table.
 * @param props - commits and interaction callbacks.
 * @returns the pane.
 */
export declare function GitGraphPane({ commits, hasMore, loadingMore, selectedCommitHash, onSelectCommit, onLoadMore, labels, }: GitGraphPaneProps): ReactNode;
