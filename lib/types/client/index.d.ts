/**
 * dsh-workspace-git — client half.
 *
 * Registers occupants into two conversation seats: the composer's input-left
 * cluster (`conversation.input.left`, a session-scoped `list` slot that
 * @deepseek-ai/dsh-client-ui-conversation renders immediately after the `.modes`
 * cluster — directly to the RIGHT of the permission/mode selector and before
 * the chat box's trailing group). The occupant is a branch pill that opens a
 * list of the repository's local branches.
 *
 * The prompt enhancer takes a DIFFERENT seat, `conversation.input.right` in the
 * trailing cluster, so it renders immediately left of the model selector rather
 * than at the end of the leading cluster. See {@link ENHANCE_SLOT}.
 *
 * Why this seat: it is the declared slot that sits right after 选择模式, so the
 * shell owns placement, spacing, and lifecycle, and nothing here breaks when the
 * composer is restyled.
 *
 * How the control is fed — the seat composes standard props for every occupant
 * (`sessionId`, the `useSessions` selector hook, the namespace translator `t`;
 * see the sibling occupants in dsh-client-ui-open-in-app and dsh-client-ui-jobs).
 * The branch store travels the seat's `inject` factory as a plain value, and the
 * selector subscribes to it directly, so a branch that resolves after mount
 * re-renders the control.
 *
 * The seat is declared by another package, and activation order between client
 * plugins is NOT constrained — so the registration rides `slots.inject`, which
 * runs the callback when the declaration is already on the ledger and otherwise
 * defers it until the declaring `register()` commits.
 *
 * Services: `slots` (the registration seam), `sessions` (kept for the list feed
 * the seat's selector reads) and `locale` (copy). `ctx.effect` owns the
 * disposers, so an HMR re-activation unregisters cleanly.
 *
 * The second seat is `conversation.view` — the session view tab ring beside
 * Trajectory. It renders GitGraphView with the same branch store inject.
 *
 * The third and fourth seats are the agent-preset surfaces
 * (`conversation.hero.agentPreset` and `conversation.session.header.actions`).
 * The official client plugin already registers into the hero seat, but returns
 * null unless General → Developer tools is on (`ap-client.js:480`); because that
 * seat is a `single` slot, its registrant holds the position while rendering
 * nothing. This plugin therefore reads the same Host registry itself
 * (`ctx.remote.agentPresets`) and draws its own control at `priority: -1`, so
 * the selector is present with Developer tools either way. Returning null to
 * "hand the seat back" would empty the cell — a `single` slot has one winner.
 */
import type { Context } from '../context-types.ts';
/**
 * Services required before mounting (all provided by the client runtime).
 *
 * `remote` is deliberately NOT here: the preset seats are an addition that a
 * deployment without the agent-preset registry simply does not get, and a hard
 * dependency would fail the whole activation — taking the branch pill and Git
 * Graph down with it — rather than omitting two controls.
 */
export declare const inject: string[];
/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, sessions, locale).
 */
export declare function apply(ctx: Context): void;
