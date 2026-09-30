/**
 * "New branch" glyph for the create-branch footer row: a simple plus.
 * Inlined like {@link GraphIcon} so the shape stays stable across primitive
 * versions without adding a new icon dependency.
 */

/** Props every icon in this plugin accepts. */
export interface NewBranchIconProps {
  /** Square edge in px; defaults to the shell's 16px glyph box. */
  size?: number
}

/**
 * The new-branch glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export function NewBranchIcon({ size = 16 }: NewBranchIconProps): JSX.Element {
  return (
    <svg
      data-workspace-git-new-branch-icon=""
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
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
