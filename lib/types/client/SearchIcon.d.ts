/**
 * Magnifying-glass glyph for the branch search field.
 * Geometry matches the shell's `IconSearchOutline16`, inlined so the plugin
 * does not grow a new icon import just for this one affordance.
 */
/** Props every icon in this plugin accepts. */
export interface SearchIconProps {
    /** Square edge in px; defaults to the shell's 16px glyph box. */
    size?: number;
}
/**
 * The search glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export declare function SearchIcon({ size }: SearchIconProps): JSX.Element;
