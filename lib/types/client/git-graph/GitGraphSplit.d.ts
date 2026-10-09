/**
 * Shared graph body: list on the left; optional commit detail on the right.
 * The detail panel is closed by default and opens only when a commit is clicked.
 *
 * Layout is single-axis FLEX, mirroring ui-trajectory's split (`display:flex`
 * with a `flex:1` table pane and a `flex:none` details rail). Grid was tried
 * first and it breaks the "two independent scrollbars" contract: a
 * `grid-template-columns` track resolves against the row box, so the commit
 * list neither clipped nor scrolled and the detail pane was pushed out of the
 * viewport. Flex derives each pane's width from the space left over, which is
 * exactly what makes overflow:auto effective.
 *
 * The split also carries `container-type: inline-size` and the scrollbar
 * variables trajectory sets, so column sizing can key off the SPLIT's width
 * (container queries) instead of guessing with viewport media queries.
 */
import { type ReactNode } from 'react';
import type { GitGraphCommit } from './types.ts';
export interface GitGraphSplitProps {
    cwd: string;
    commits: readonly GitGraphCommit[];
    hasMore: boolean;
    loadingMore: boolean;
    selectedCommitHash: string | null;
    onSelectCommit: (hash: string | null) => void;
    onLoadMore: () => void;
    t: (key: string, fallback: string) => string;
    /** Short ref name -> object id, for resolving a branch selection to a walk root. */
    refTips?: Readonly<Record<string, string>>;
}
/**
 * Split layout used by both the session view and the modal dialog.
 */
export declare function GitGraphSplit({ cwd, commits, hasMore, loadingMore, selectedCommitHash, onSelectCommit, onLoadMore, t, refTips, }: GitGraphSplitProps): ReactNode;
