/**
 * Commit-graph glyph for the "Git Graph" footer row (three nodes on rails).
 * Inlined like {@link BranchIcon} so the shape stays stable across primitive
 * versions without adding a new icon dependency.
 */
/** Props every icon in this plugin accepts. */
export interface GraphIconProps {
    /** Square edge in px; defaults to the shell's 16px glyph box. */
    size?: number;
}
/**
 * The git-graph glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export declare function GraphIcon({ size }: GraphIconProps): JSX.Element;
