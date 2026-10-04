/**
 * The agent-preset glyph, drawn in the same style as this plugin's other icons
 * ({@link BranchIcon}): inlined as `currentColor` so the chip, its menu rows,
 * and the header label each tint it from their own text color.
 *
 * The shape is a sliders/controls mark — the conventional "agent configuration"
 * affordance — chosen because the plugin must not import an icon from
 * `dsh-client-ui-primitives`: the official chip's `IconAgentPreset*` glyph is
 * not part of that package's exported surface, and adding a value import would
 * have to survive the build's purity gate for no visual gain.
 */

/** Props every icon in this plugin accepts. */
export interface AgentPresetIconProps {
  /** Square edge in px; defaults to the shell's 16px glyph box. */
  size?: number
}

/**
 * The agent-preset glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export function AgentPresetIcon({ size = 16 }: AgentPresetIconProps): React.ReactNode {
  return (
    <svg
      data-workspace-git-icon=""
      data-icon="agent-preset"
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      {/* Three horizontal rails, each with a knob at a different position. */}
      <path
        d="M128 256a42.667 42.667 0 0 1 42.667-42.667h245.333a42.667 42.667 0 0 1 0 85.334H170.667A42.667 42.667 0 0 1 128 256z m469.333 0a42.667 42.667 0 0 1 42.667-42.667h213.333a42.667 42.667 0 0 1 0 85.334H640A42.667 42.667 0 0 1 597.333 256z"
        fill="currentColor"
      />
      <path
        d="M128 512a42.667 42.667 0 0 1 42.667-42.667h85.333a42.667 42.667 0 0 1 0 85.334H170.667A42.667 42.667 0 0 1 128 512z m309.333 0a42.667 42.667 0 0 1 42.667-42.667h373.333a42.667 42.667 0 0 1 0 85.334H480A42.667 42.667 0 0 1 437.333 512z"
        fill="currentColor"
      />
      <path
        d="M128 768a42.667 42.667 0 0 1 42.667-42.667h341.333a42.667 42.667 0 0 1 0 85.334H170.667A42.667 42.667 0 0 1 128 768z m565.333 0a42.667 42.667 0 0 1 42.667-42.667h117.333a42.667 42.667 0 0 1 0 85.334H736A42.667 42.667 0 0 1 693.333 768z"
        fill="currentColor"
      />
      {/* The knobs. */}
      <circle cx="512" cy="256" r="85.333" fill="currentColor" />
      <circle cx="298.667" cy="512" r="85.333" fill="currentColor" />
      <circle cx="597.333" cy="768" r="85.333" fill="currentColor" />
    </svg>
  )
}
