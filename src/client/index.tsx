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
 */
import type { Context } from '../context-types.ts'
import { BranchStore } from './store.ts'
import { BranchSelect } from './BranchSelect.tsx'
import { GitGraphView } from './git-graph/GitGraphView.tsx'
import { LOCALE_NS, attachLocale, en, zh } from './locales.ts'

/** Services required before mounting (all provided by the client runtime). */
export const inject = ['slots', 'sessions', 'locale']

/** The slot this plugin occupies: the composer's left tool cluster, right after the mode selector. */
const INPUT_SLOT = 'conversation.input.left'
const VIEW_SLOT = 'conversation.view'

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
}
