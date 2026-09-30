import type { GitGraphCommit } from './types.ts';
export interface GraphPoint {
    laneIndex: number;
    rowIndex: number;
}
export interface BranchLineSeed {
    from: GraphPoint;
    to: GraphPoint;
    laneIndex: number;
    sourceHash: string;
    targetHash: string;
    lockedFirst: boolean;
}
declare class LayoutBranch {
    readonly colourIndex: number;
    readonly lines: BranchLineSeed[];
    endRowIndex: number;
    constructor(colourIndex: number);
    addLine(from: GraphPoint, to: GraphPoint, sourceHash: string, targetHash: string, lockedFirst: boolean): void;
}
declare class LayoutVertex {
    readonly id: number;
    readonly hash: string;
    private readonly parents;
    private nextParentIndex;
    private laneIndex;
    private branch;
    private nextLaneIndex;
    private readonly connections;
    constructor(id: number, hash: string);
    addParent(vertex: LayoutVertex): void;
    getNextParent(): LayoutVertex | null;
    registerParentProcessed(): void;
    isMerge(): boolean;
    isNotOnBranch(): boolean;
    addToBranch(branch: LayoutBranch, laneIndex: number): void;
    getBranch(): LayoutBranch | null;
    getLaneIndex(): number;
    getPoint(): GraphPoint;
    getNextPoint(): GraphPoint;
    getPointConnectingTo(target: LayoutVertex, branch: LayoutBranch): {
        laneIndex: number;
        rowIndex: number;
    } | null;
    reservePoint(laneIndex: number, target: LayoutVertex, branch: LayoutBranch): void;
    getWidthLaneIndex(): number;
}
export declare function createGitGraphLayoutModel(commits: readonly GitGraphCommit[]): {
    vertices: LayoutVertex[];
    vertexByHash: Map<string, LayoutVertex>;
    branchLines: BranchLineSeed[];
};
export {};
