import type { GitGraphCommit, GitGraphRef, GitGraphRefKind } from './types.ts';
export type { GitGraphRefKind, GitGraphRef, GitGraphCommit };
export interface GitGraphLayoutOptions {
    rowHeight?: number;
    laneGap?: number;
    lanePadding?: number;
    topPadding?: number;
    bottomPadding?: number;
}
export interface GitGraphLayoutRow {
    commit: GitGraphCommit;
    rowIndex: number;
    laneIndex: number;
    x: number;
    y: number;
}
export interface GitGraphLayoutEdge {
    id: string;
    fromHash: string;
    toHash: string;
    fromLaneIndex: number;
    toLaneIndex: number;
    path: string;
    truncated: boolean;
}
interface GitGraphLayoutLaneSegment {
    id: string;
    hash: string;
    laneIndex: number;
    path: string;
}
export interface GitGraphLayoutPath {
    id: string;
    laneIndex: number;
    path: string;
    relatedHashes: string[];
}
export interface GitGraphLayout {
    rows: GitGraphLayoutRow[];
    edges: GitGraphLayoutEdge[];
    laneSegments: GitGraphLayoutLaneSegment[];
    paths: GitGraphLayoutPath[];
    laneCount: number;
    width: number;
    height: number;
    rowHeight: number;
    laneGap: number;
}
export declare function layoutGitGraph(commits: readonly GitGraphCommit[], options?: GitGraphLayoutOptions): GitGraphLayout;
