/**
 * "New branch" glyph for the create-branch footer row: a simple plus.
 * Inlined like {@link GraphIcon} so the shape stays stable across primitive
 * versions without adding a new icon dependency.
 */
/** Props every icon in this plugin accepts. */
export interface NewBranchIconProps {
    /** Square edge in px; defaults to the shell's 16px glyph box. */
    size?: number;
}
/**
 * The new-branch glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export declare function NewBranchIcon({ size }: NewBranchIconProps): JSX.Element;
