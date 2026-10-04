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
import type { Context } from '../context-types.ts'
import { BranchStore } from './store.ts'
import { BranchSelect } from './BranchSelect.tsx'
import { GitGraphView } from './git-graph/GitGraphView.tsx'
import { AgentPresetStore } from './agent-preset/store.ts'
import { AgentPresetChip } from './agent-preset/AgentPresetChip.tsx'
import { PromptEnhancer } from './prompt-enhance/PromptEnhancer.tsx'
import { AgentPresetLabel } from './agent-preset/AgentPresetLabel.tsx'
import type { AgentPresetsRemote } from './agent-preset/api.ts'
import { LOCALE_NS, attachLocale, en, zh } from './locales.ts'

/**
 * Services required before mounting (all provided by the client runtime).
 *
 * `remote` is deliberately NOT here: the preset seats are an addition that a
 * deployment without the agent-preset registry simply does not get, and a hard
 * dependency would fail the whole activation — taking the branch pill and Git
 * Graph down with it — rather than omitting two controls.
 */
export const inject = ['slots', 'sessions', 'locale']

/** The slot the BRANCH pill occupies: the composer's left tool cluster, after the mode selector. */
const INPUT_SLOT = 'conversation.input.left'
const VIEW_SLOT = 'conversation.view'
/**
 * The seat the prompt ENHANCER occupies: the compact-control run immediately
 * left of the model selector, in the composer's TRAILING cluster.
 *
 * ## Why not `input.left`
 *
 * `ui-conversation` splits the tool row into two containers:
 *
 *   [ leading  ]  + · permission · plan · input.left
 *   [ trailing ]  input.right · input.model · submit
 *
 * So `input.left` and `input.model` sit in DIFFERENT containers — a higher
 * `order` in `input.left` only makes an occupant the rightmost of the leading
 * cluster, not adjacent to the model picker. "Next to the model selector"
 * requires the trailing cluster, i.e. this seat.
 *
 * The runtime's own slot contract names it "Compact controls before the
 * composer submit action", `kind: 'list'`, `scope: 'session'`, with
 * `occupants: []` and `replaceRisk: 'none'` as of rev `d5562dc82e23` — nothing
 * registers there, so a `list` seat is used and no `priority: -1` shadowing of
 * a foreign control is needed (contrast `input.model`, a `single` seat the
 * official picker holds at priority 0).
 */
const ENHANCE_SLOT = 'conversation.input.right'
/**
 * The hero row's agent-preset seat, declared by ui-conversation as `single` and
 * rendered directly after `conversation.hero.workspace` (选择工作区).
 */
const HERO_PRESET_SLOT = 'conversation.hero.agentPreset'
/** The session header's action list, where the read-only preset label goes. */
const HEADER_ACTION_SLOT = 'conversation.session.header.actions'

/** The header seat's preset label id. */
const HEADER_LABEL_ID = 'workspace-git-agent-preset'

/**
 * A boolean setting exposed by the client runtime as a snapshot source.
 *
 * `configForms.developerTools.enabled` is this shape: the official plugin reads
 * it with `getSnapshot()` and subscribes with `subscribe()`.
 */
interface BooleanSnapshotSource {
  getSnapshot(): boolean
  subscribe(listener: () => void): () => void
}

/**
 * Locate the Developer-tools setting, if this deployment mounts it.
 *
 * Probed structurally rather than through a hard `inject` entry: the setting is
 * owned by the settings UI, and a deployment without it must still get the
 * preset chip (in that case nothing gates the official chip either, so the
 * honest default is "not enabled" — meaning we do NOT defer).
 *
 * @param ctx - the client plugin context.
 * @returns the snapshot source, or undefined when the setting is absent.
 */
function detectDeveloperTools(ctx: Context): BooleanSnapshotSource | undefined {
  const configForms = (ctx.get('configForms') ?? undefined) as
    | { developerTools?: { enabled?: BooleanSnapshotSource } }
    | undefined
  return configForms?.developerTools?.enabled
}

/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, sessions, locale).
 */
export function apply(ctx: Context): void {
  attachLocale(ctx.locale)
  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', zh)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', en)
    return () => { offZh(); offEn() }
  }, 'dsh-workspace-git: dictionaries')

  // One store per activation (never a module-level singleton: a singleton would
  // survive HMR and serve answers resolved by a previous activation).
  const store = new BranchStore()
  ctx.effect(() => () => store.dispose(), 'dsh-workspace-git: branch store')

  ctx.effect(
    () => ctx.slots.inject(INPUT_SLOT, () => ctx.slots.register({
      name: INPUT_SLOT,
      id: 'workspace-git',
      // This seat renders after the mode cluster, so a positive order only
      // decides the pill's position among any other occupants of the same seat.
      order: 20,
      locale: LOCALE_NS,
      registrant: 'dsh-workspace-git',
      // A plain value the seat merges into the occupant's props. The selector
      // needs the store instance (not a per-session snapshot) because it
      // subscribes for answers that arrive after mount.
      inject: () => ({ store }),
    }, BranchSelect)),
    'dsh-workspace-git: composer branch selector',
  )

  // The prompt enhancer. It sits in the TRAILING cluster, immediately left of
  // the model selector — see {@link ENHANCE_SLOT} for why that is a different
  // seat from the branch pill's and why `order` cannot express it.
  //
  // No `order`: this is currently the seat's only occupant, and the seat's own
  // place in the row is what puts the button next to the model picker. A number
  // here would only matter once someone else registers, and would then be a
  // guess about who should win that row — not a decision this plugin should
  // make on their behalf.
  //
  // `inject` is a FUNCTION OF THE SESSION, and that is the only way an occupant
  // of this seat learns which session it belongs to. `ui-conversation` renders
  // it as `renderSlot("conversation.input.right", {})` — an empty props object —
  // so nothing arrives implicitly: `sessionId`, the draft, and the composer's
  // write face must all be supplied here. (The official model selector does the
  // same at `dsh-client-ui-model-selection/lib/client.js:1251`.)
  ctx.effect(
    () => ctx.slots.inject(ENHANCE_SLOT, () => ctx.slots.register({
      name: ENHANCE_SLOT,
      id: 'workspace-git-prompt-enhance',
      locale: LOCALE_NS,
      registrant: 'dsh-workspace-git',
      inject: (sessionId) => ({ sessionId }),
    }, PromptEnhancer)),
    'dsh-workspace-git: composer prompt enhancer',
  )

  ctx.effect(
    () => ctx.slots.inject(VIEW_SLOT, () => ctx.slots.register({
      name: VIEW_SLOT,
      id: 'workspace-git-graph',
      order: 20,
      locale: LOCALE_NS,
      registrant: 'dsh-workspace-git',
      label: () => {
        const active = ctx.locale.getSnapshot().active
        const zhLike = active.startsWith('zh')
        return zhLike ? 'Git 图谱' : 'Git Graph'
      },
      inject: () => ({ store }),
    }, GitGraphView)),
    'dsh-workspace-git: git graph conversation view',
  )

  // The preset seats need the Host remote namespace. `ctx.inject` is what makes
  // that a DEPENDENCY rather than an assumption:
  //
  //   - activation order between client plugins is NOT constrained, so reading
  //     `ctx.get('remote')` inline at apply time can observe `undefined` (the
  //     provider's fiber is not active yet) and silently register nothing —
  //     which is exactly the "no chip, no error" failure this replaces;
  //   - `ctx.inject` starts a child fiber that cordis activates only once these
  //     services exist, and re-runs if they later appear or are replaced.
  //
  // `remote.agentPresets` is the namespace this feature actually calls, so it is
  // named here directly: a deployment without the agent-preset registry never
  // runs the callback, and the two seats are simply absent (never empty shells).
  ctx.inject(['remote', 'remote.agentPresets'], (rawScope) => {
    // cordis hands the child callback its own bare Context; the service faces
    // this plugin declares (slots, locale, …) are re-attached here, where the
    // dependencies above guarantee they exist.
    const scope = rawScope as unknown as Context
    const remote = scope.get('remote') as AgentPresetsRemote
    // One store serves both seats: the roster is Host state, not per-seat state.
    const presetStore = new AgentPresetStore(remote)
    scope.effect(() => () => presetStore.dispose(), 'dsh-workspace-git: agent preset store')

    // Priority -1 shadows the official occupant (default 0) without throwing.
    // This chip always paints when the roster is ready; rendering null would
    // empty the cell rather than reveal the official chip. Developer tools is
    // only forwarded to the header label, which shares a `list` seat.
    const developerToolsEnabled = detectDeveloperTools(scope)

    scope.effect(
      () => scope.slots.inject(HERO_PRESET_SLOT, () => scope.slots.register({
        name: HERO_PRESET_SLOT,
        // CONFLICT AVOIDANCE — do not remove.
        //
        // `conversation.hero.agentPreset` is a `single` slot and the official
        // plugin registers into it at the default priority 0. A second
        // registration at the SAME priority THROWS ("single slot ... already has
        // a registration at priority 0 ... register at a different priority to
        // shadow it"), and that throw would abort this whole `apply`, taking the
        // branch pill and Git Graph down with it.
        //
        // Priority is the documented cell-shadowing rank (lowest renders), so
        // -1 avoids the throw and lets this chip hold the seat. Holding the seat
        // is exclusive: this chip must draw; it cannot return null and expect
        // the official occupant to appear.
        priority: -1,
        locale: LOCALE_NS,
        registrant: 'dsh-workspace-git',
        inject: () => ({ store: presetStore }),
      }, AgentPresetChip)),
      'dsh-workspace-git: agent preset chip',
    )

    ctx.effect(
      () => scope.slots.inject(HEADER_ACTION_SLOT, () => scope.slots.register({
        name: HEADER_ACTION_SLOT,
        id: HEADER_LABEL_ID,
        // Matches the official label's order, so if both are ever visible they
        // group at the left of the action row instead of interleaving.
        order: -10,
        locale: LOCALE_NS,
        registrant: 'dsh-workspace-git',
        inject: () => ({ store: presetStore, developerTools: developerToolsEnabled }),
      }, AgentPresetLabel)),
      'dsh-workspace-git: agent preset header label',
    )
  })
}
