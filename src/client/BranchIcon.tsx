/**
 * The branch glyph used by every branch affordance this plugin draws.
 *
 * Inlined as a filled fork mark so the pill and every menu row share one
 * stable shape without pulling an icon from the primitives package. A new
 * value import there would have to survive the build's purity gate and the
 * runtime module table.
 *
 * `currentColor` is deliberate: the icon inherits the surrounding text color,
 * so the trigger pill and a menu row (and its selected state) each tint it
 * correctly without a second prop.
 */

/** Props every icon in this plugin accepts. */
export interface BranchIconProps {
  /** Square edge in px; defaults to the shell's 16px glyph box. */
  size?: number
}

/**
 * The branch glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export function BranchIcon({ size = 16 }: BranchIconProps): React.ReactNode {
  return (
    <svg
      data-workspace-git-icon=""
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      <path
        d="M746.666667 170.666667C664.32 170.666667 597.333333 237.653333 597.333333 320c0 66.304 43.733333 121.984 103.68 141.44-6.229333 39.765333-23.338667 72.533333-52.48 99.114667-83.029333 75.648-235.818667 82.56-307.2 81.365333V377.045333c61.44-18.517333 106.666667-74.965333 106.666667-142.378666C448 152.32 381.013333 85.333333 298.666667 85.333333S149.333333 152.32 149.333333 234.666667c0 67.413333 45.226667 123.861333 106.666667 142.378666v269.909334c-61.44 18.517333-106.666667 74.965333-106.666667 142.378666C149.333333 871.68 216.32 938.666667 298.666667 938.666667s149.333333-66.986667 149.333333-149.333334c0-23.509333-5.973333-45.44-15.658667-65.237333 87.893333-7.936 198.698667-32.298667 273.450667-100.266667 46.805333-42.538667 73.856-96.597333 81.237333-160.768C849.706667 445.354667 896 388.266667 896 320 896 237.653333 829.013333 170.666667 746.666667 170.666667z m-512 64C234.666667 199.381333 263.381333 170.666667 298.666667 170.666667s64 28.714667 64 64S333.952 298.666667 298.666667 298.666667s-64-28.714667-64-64zM298.666667 853.333333c-35.285333 0-64-28.714667-64-64a64 64 0 0 1 63.232-63.914666l5.546666 0.426666A63.786667 63.786667 0 0 1 298.666667 853.333333zM746.666667 384c-35.285333 0-64-28.714667-64-64S711.381333 256 746.666667 256s64 28.714667 64 64S781.952 384 746.666667 384z"
        fill="currentColor"
      />
    </svg>
  )
}
