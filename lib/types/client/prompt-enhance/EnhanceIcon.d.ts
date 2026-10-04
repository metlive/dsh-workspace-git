/**
 * The prompt-enhancer glyph: WorkBuddy's "增强提示词" mark, plus its spinner.
 *
 * ## Why this exact artwork
 *
 * The path is lifted verbatim from WorkBuddy's own chat-input EnhanceButton
 * (`im-channels/ui/assets/plan-input-*.js`, component `fV`): a four-point
 * sparkle with a diagonal stroke through it, on a 16×16 grid. Reusing the real
 * mark is the point — a wand drawn differently from the host app's reads as a
 * different feature, and this control sits in the same composer row.
 *
 * The artwork is authored on a 16-unit grid, so the default is 16; the button
 * asks for 15 to line up with this plugin's other glyphs.
 *
 * ## Both marks are `currentColor`
 *
 * The button tints them from its own text color, so every state (idle, hover,
 * busy, disabled) needs no per-state assets.
 */
/** Props every icon in this plugin accepts. */
export interface EnhanceIconProps {
    /** Square edge in px; defaults to the composer's 16px glyph box. */
    size?: number;
}
/**
 * The prompt-enhancer glyph: sparkle + diagonal stroke.
 * @param props - the drawn size.
 * @returns the icon element.
 */
export declare function EnhanceIcon({ size }: EnhanceIconProps): React.ReactNode;
/**
 * The in-flight spinner: a ~270° arc rotating once per second.
 *
 * The same mark WorkBuddy swaps in while enhancing (component `hV` there): an
 * `r=6` circle with `strokeDasharray: 28 10`, so a little over half the
 * circumference is drawn and the open remainder is what makes the rotation read
 * as motion instead of a static ring.
 *
 * The rotation is an inline `animation` plus a co-located `<style>` rule rather
 * than a stylesheet: this plugin ships no CSS, and one keyframe does not justify
 * adding a sheet or a global class namespace. The rule is namespaced
 * (`dsw-`) and the `prefers-reduced-motion` branch holds the arc still, because
 * endless rotation is exactly the motion that setting exists to suppress.
 * @param props - the drawn size.
 * @returns the spinner element.
 */
export declare function EnhanceSpinner({ size }: EnhanceIconProps): React.ReactNode;
