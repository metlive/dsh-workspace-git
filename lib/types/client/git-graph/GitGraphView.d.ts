/**
 * Session conversation view: commit graph gated on a known HEAD for the workspace.
 */
import { type ReactNode } from 'react';
import type { BranchStore } from '../store.ts';
/** The session list snapshot face this component reads through `useSessions`. */
interface SessionListLike {
    byId: Record<string, {
        cwd?: string;
    } | undefined>;
}
export interface GitGraphViewProps {
    sessionId?: string;
    useSessions?: <T>(selector: (state: SessionListLike) => T) => T;
    t?: (key: string) => string;
    store?: BranchStore;
}
/**
 * Git graph session view. Renders nothing until the branch store knows HEAD.
 */
export declare function GitGraphView({ sessionId, useSessions, t, store }: GitGraphViewProps): ReactNode;
export {};
