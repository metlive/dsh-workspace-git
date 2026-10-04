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
  id: string
  name?: string
  description?: string
}

/**
 * Built-in presets and the locale keys of their shipped copy.
 *
 * Kept in sync with `@deepseek-ai/dsh-client-ui-agent-preset`'s
 * `BUILT_IN_PRESET_KEYS`; an id absent here falls back to the roster's own
 * metadata, which is the correct behavior for a user-authored preset (its
 * name/description must not be treated as translatable).
 */
const BUILT_IN_PRESET_KEYS: Record<string, { name: string; description: string }> = {
  standard: { name: 'presetStandardName', description: 'presetStandardDescription' },
  ptc: { name: 'presetPtcName', description: 'presetPtcDescription' },
  minimal: { name: 'presetMinimalName', description: 'presetMinimalDescription' },
  cordis: { name: 'presetCordisName', description: 'presetCordisDescription' },
}

/** Display copy both surfaces and the menu intro line share. */
export interface PresetDisplay {
  name: string
  description?: string
}

/**
 * Whether a roster row is one of the shipped presets whose copy the dictionaries
 * carry. A shipped preset publishes no `name`; a declaration that names itself
 * owns its copy.
 * @param preset - roster row.
 */
function isBuiltInPreset(preset: PresetLike): boolean {
  return preset.name === undefined && BUILT_IN_PRESET_KEYS[preset.id] !== undefined
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
export function presetDisplay(
  preset: PresetLike | undefined,
  t?: (key: string) => string,
): PresetDisplay {
  if (preset === undefined) return { name: '' }
  const keys = isBuiltInPreset(preset) ? BUILT_IN_PRESET_KEYS[preset.id] : undefined
  if (keys !== undefined) {
    return {
      name: t?.(keys.name) ?? preset.id,
      description: t?.(keys.description),
    }
  }
  return {
    name: preset.name ?? preset.id,
    ...preset.description === undefined ? {} : { description: preset.description },
  }
}

/**
 * Resolve a preset's display name.
 *
 * @param preset - the preset being rendered, or undefined before a roster lands.
 * @param t - namespace-bound translator supplied by the seat.
 * @returns the display name.
 */
export function presetLabel(
  preset: PresetLike | undefined,
  t?: (key: string) => string,
): string {
  return presetDisplay(preset, t).name
}
