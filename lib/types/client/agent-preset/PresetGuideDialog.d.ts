/**
 * Help dialog for a shipped agent preset: the same system Modal / tabs /
 * Markdown surfaces the official settings cards use for 模式说明 and 如何使用.
 */
import { type ReactNode } from 'react';
import type { GuidePage, PresetGuide } from './guides.ts';
export interface PresetGuideDialogProps {
    guide: PresetGuide;
    initialPage: GuidePage;
    t?: (key: string) => string;
    onClose: () => void;
}
/**
 * Open the curated guide in a system modal.
 * @param props - guide keys, starting tab, translator, close handler.
 */
export declare function PresetGuideDialog({ guide, initialPage, t, onClose, }: PresetGuideDialogProps): ReactNode;
