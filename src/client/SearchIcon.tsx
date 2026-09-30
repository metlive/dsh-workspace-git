/**
 * Magnifying-glass glyph for the branch search field.
 * Geometry matches the shell's `IconSearchOutline16`, inlined so the plugin
 * does not grow a new icon import just for this one affordance.
 */

/** Props every icon in this plugin accepts. */
export interface SearchIconProps {
  /** Square edge in px; defaults to the shell's 16px glyph box. */
  size?: number
}

/**
 * The search glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export function SearchIcon({ size = 16 }: SearchIconProps): JSX.Element {
  return (
    <svg
      data-workspace-git-search-icon=""
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
        d="M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z"
        fill="currentColor"
      />
      <path
        d="M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z"
        fill="currentColor"
      />
    </svg>
  )
}
