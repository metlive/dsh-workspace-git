/**
 * Modal wrapper that loads the commit graph for a workspace path.
 * Opened from the branch menu's "Git Graph" footer.
 */
import { type ReactNode } from 'react';
export interface GitGraphDialogProps {
    open: boolean;
    cwd: string;
    onClose: () => void;
    t?: (key: string) => string;
}
/**
 * Commit-graph dialog.
 */
export declare function GitGraphDialog({ open, cwd, onClose, t }: GitGraphDialogProps): ReactNode;
