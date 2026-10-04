/**
 * Preset display copy.
 *
 * The Host ships presets whose `id` is a well-known value (`standard`, `ptc`,
 * `minimal`, `cordis`) and usually carries NO `name`/`description` — the
 * official client plugin substitutes localized copy for those ids. This module
 * mirrors that rule so a built-in preset reads as "标准模式" rather than
 * "standard" in both surfaces this plugin draws.
 *
 * The rule is copied rather than imported on purpose: it is a display
 * convention, not a Host contract, and the official package that holds it is
 * the one whose gate this plugin exists to bypass.
 */
/** One preset as both surfaces render it. */
export interface PresetLike {
    id: string;
    name?: string;
    description?: string;
}
/** Display copy both surfaces and the menu intro line share. */
export interface PresetDisplay {
    name: string;
    description?: string;
}
/**
 * Resolve preset display copy without making user-authored metadata translatable.
 *
 * Mirrors the official `presetDisplayText`: built-in ids with no published name
 * take localized name AND description; anything else uses declaration metadata
 * (then its id), untranslated.
 *
 * @param preset - the preset being rendered, or undefined before a roster lands.
 * @param t - namespace-bound translator supplied by the seat.
 * @returns localized copy for a known shipped preset, otherwise declaration metadata.
 */
export declare function presetDisplay(preset: PresetLike | undefined, t?: (key: string) => string): PresetDisplay;
/**
 * Resolve a preset's display name.
 *
 * @param preset - the preset being rendered, or undefined before a roster lands.
 * @param t - namespace-bound translator supplied by the seat.
 * @returns the display name.
 */
export declare function presetLabel(preset: PresetLike | undefined, t?: (key: string) => string): string;
