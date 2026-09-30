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
    size?: number;
}
/**
 * The branch glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export declare function BranchIcon({ size }: BranchIconProps): React.ReactNode;
