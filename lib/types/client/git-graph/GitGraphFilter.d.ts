/**
 * Branch + author filter toolbar for the commit graph.
 *
 * Two native `<select>` dropdowns sit in a compact toolbar above the commit
 * table: one for branch (local then remote), one for author ("操作者"). Native
 * selects keep the keyboard and screen-reader contract without depending on a
 * Menu primitive that closes on every click — which is the wrong interaction
 * for a facet panel, and also wrong for a single-select that should stay put
 * after a choice.
 *
 * The component is presentational: it renders whatever facets it is handed and
 * reports dimension changes upward. All filtering logic lives in `filter.ts`.
 */
import { type ReactNode } from 'react';
import { type FacetOption, type GraphFilter } from './filter.ts';
export interface GitGraphFilterProps {
    /** The selectable values present in the loaded commits. */
    facets: readonly FacetOption[];
    /** The active selection. */
    filter: GraphFilter;
    /** Replace the branch dimension (empty string clears). */
    onBranchChange: (branch: string) => void;
    /** Replace the author dimension (empty string clears). */
    onAuthorChange: (author: string) => void;
    /** Clear every dimension. */
    onClear: () => void;
    /** How many commits the filter currently shows, and how many are loaded. */
    shownCount: number;
    totalCount: number;
    labels: {
        branches: string;
        localBranches: string;
        remoteBranches: string;
        authors: string;
        clear: string;
        empty: string;
        none: string;
        allAuthors: string;
        shown: (shown: number, total: number) => string;
    };
}
/**
 * Render the branch / author filter toolbar.
 * @param props - facets, the active filter, and their handlers.
 * @returns the toolbar with two dropdowns.
 */
export declare function GitGraphFilterControl({ facets, filter, onBranchChange, onAuthorChange, onClear, shownCount, totalCount, labels, }: GitGraphFilterProps): ReactNode;
