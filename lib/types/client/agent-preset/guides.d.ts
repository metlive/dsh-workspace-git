/**
 * Shipped-preset help keys, matching `@deepseek-ai/dsh-client-ui-agent-preset`.
 *
 * Custom / unknown ids have no curated guide; those rows omit the help actions
 * the same way the official settings cards do (`presetGuide` returns undefined
 * unless the row is a known shipped id).
 */
/** Which pane the system dialog opens on. */
export type GuidePage = 'explanation' | 'usage';
/** Locale keys for one shipped preset's help dialog. */
export interface PresetGuide {
    name: string;
    intro: string;
    explanation: string;
    usage: string;
}
/**
 * Look up curated help for a roster id.
 * @param id - preset identifier from the roster.
 * @returns the shipped guide keys, or undefined for unknown and custom presets.
 */
export declare function presetGuide(id: string): PresetGuide | undefined;
