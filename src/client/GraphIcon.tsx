/**
 * Commit-graph glyph for the "Git Graph" footer row (three nodes on rails).
 * Inlined like {@link BranchIcon} so the shape stays stable across primitive
 * versions without adding a new icon dependency.
 */

/** Props every icon in this plugin accepts. */
export interface GraphIconProps {
  /** Square edge in px; defaults to the shell's 16px glyph box. */
  size?: number
}

/**
 * The git-graph glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export function GraphIcon({ size = 16 }: GraphIconProps): JSX.Element {
  return (
    <svg
      data-workspace-git-graph-icon=""
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      <path
        d="M4 1.5v13M8 1.5v13M12 1.5v5.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="4" cy="4" r="1.6" fill="currentColor" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" />
      <circle cx="4" cy="12" r="1.6" fill="currentColor" />
      <path
        d="M4 4h4M8 8h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
