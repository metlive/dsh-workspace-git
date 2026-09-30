/**
 * Right-hand commit detail: message block + nested changed-file tree.
 * Mounted only while a commit is selected; includes an explicit close control.
 */
import { type ReactNode } from 'react';
export interface GitGraphDetailPanelProps {
    cwd: string;
    hash: string;
    onClose: () => void;
    /**
     * Rail width CSS. Defaults match ui-trajectory's `.details`:
     * `clamp(320px, 38%, 440px)` bounded by `calc(100% - 280px)` so the commit
     * list always keeps a usable minimum. `narrowWidth` is applied by the split's
     * container query under ~900px of SPLIT width (not viewport width).
     */
    width?: string;
    maxWidth?: string;
    narrowWidth?: string;
    labels: {
        loading: string;
        error: string;
        close: string;
        commitInfo: string;
        author: string;
        time: string;
        branches: string;
        files: string;
        filesCount: (n: number) => string;
        inBranches: (n: number) => string;
    };
}
/**
 * Detail panel for one selected commit.
 */
export declare function GitGraphDetailPanel({ cwd, hash, onClose, width, maxWidth, narrowWidth, labels, }: GitGraphDetailPanelProps): ReactNode;
