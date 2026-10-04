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
    size?: number;
}
/**
 * The agent-preset glyph.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export declare function AgentPresetIcon({ size }: AgentPresetIconProps): React.ReactNode;
