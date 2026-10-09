/**
 * Branch/tag/author filter control for the commit graph.
 *
 * A single trigger button ("筛选") in the graph's header row, opening a popover
 * of grouped checkboxes with an active-count badge and a clear action. It is a
 * plain button + absolutely-positioned popover rather than the `Menu` primitive,
 * for one reason: `Menu` treats a click as a selection and closes, but a facet
 * panel must stay open while several boxes are ticked. The dismissal contract
 * (outside click, Escape) is the same one `Menu` implements, so nothing about
 * the interaction is novel.
 *
 * The component is presentational: it renders whatever facets it is handed and
 * reports toggles upward. All filtering logic lives in `filter.ts`.
 */
import { type ReactNode } from 'react';
import { type FacetOption, type GraphFilter } from './filter.ts';
export interface GitGraphFilterProps {
    /** The selectable values present in the loaded commits. */
    facets: readonly FacetOption[];
    /** The active selection. */
    filter: GraphFilter;
    /** Toggle one facet value. */
    onToggle: (option: FacetOption) => void;
    /** Clear every dimension. */
    onClear: () => void;
    /** How many commits the filter currently shows, and how many are loaded. */
    shownCount: number;
    totalCount: number;
    labels: {
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
    };
}
/**
 * Render the filter control.
 * @param props - facets, the active filter, and their handlers.
 * @returns the trigger and its popover.
 */
export declare function GitGraphFilterControl({ facets, filter, onToggle, onClear, shownCount, totalCount, labels, }: GitGraphFilterProps): ReactNode;
