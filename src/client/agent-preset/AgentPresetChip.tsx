/**
 * The agent-preset chip for `conversation.hero.agentPreset` — the seat the
 * shell renders directly after `conversation.hero.workspace` ("选择工作区").
 *
 * This is the plugin's answer to the hard gate in the official client plugin:
 * `AgentPresetSeat` returns null unless General → Developer tools is on
 * (`ap-client.js:480`), and because that seat is a `single` slot the official
 * registrant keeps the position while rendering nothing. We therefore cannot
 * make the official component appear and must not add a second occupant of a
 * `single` seat — but we CAN read the same Host roster and draw the control,
 * which is what this component does. The user-visible result is the selector
 * sitting beside 选择工作区, with Developer tools either on or off.
 *
 * Independence from the official plugin is deliberate and total: no shared
 * store, no shared component, no import from `dsh-client-ui-agent-preset`. The
 * only shared dependency is the Host remote namespace both read.
 *
 * HOW IT SHARES THE SEAT. The seat is `single`, so two registrations at the
 * same priority would THROW at load; this chip therefore registers at
 * `priority: -1` (the documented shadowing rank, lowest renders) to coexist
 * with the official entry and win the cell. Winning the cell is exclusive:
 * returning null does NOT reveal the official occupant — it empties the seat.
 * This chip therefore always paints when the roster is ready, whether or not
 * General → Developer tools is on. The official chip is gated to null when
 * that setting is off, and is shadowed by this cell when the setting is on.
 *
 * Deliberately NOT copied from the official chip: its per-character intro
 * animation and its staged "the NEXT session gets this preset" model. Staging
 * exists because the official chip owns the unbound new-session screen; this
 * plugin's chip switches the session it is actually attached to, which is the
 * behavior that matches what the user sees beside the workspace they picked.
 *
 * ## The switchable precondition (`blank`)
 *
 * A preset change is accepted only by a session that has not run yet. The Host
 * refuses to adopt an existing session under a different preset — a running
 * session keeps the composition it began with — so this chip gates on
 * `session.blank`, the same field the official controller guards on
 * (`ap-client.js`, `AgentPresetSeatController.apply`).
 *
 * Gating BEFORE the call is the point: the earlier version only checked that a
 * session id existed, so on a session that had already taken a turn it really
 * did issue `select` and ate the Host's refusal, leaning on the store's
 * optimistic update and rollback to recover. The refusal was survivable, but the
 * request was pointless. The comparison is `=== true` so an absent `blank`
 * (thinner session list) reads as "not switchable", never as "switchable".
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Menu, MenuItemButton, Tag, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentPresetStore } from './store.ts'
import { AgentPresetIcon } from './AgentPresetIcon.tsx'
import { presetDisplay, presetLabel } from './labels.ts'
import { presetGuide, type GuidePage } from './guides.ts'
import { PresetGuideDialog } from './PresetGuideDialog.tsx'

/** How long a refusal toast stays up, in milliseconds. */
const REFUSAL_HOLD_MS = 8_000

const MENU_STYLE_ID = 'workspace-git-preset-menu-css'
const MENU_LIST_CLASS = 'workspace-git-preset-menu'
const MENU_CSS = `
.${MENU_LIST_CLASS} {
  background: #fff !important;
  width: 330px !important;
  max-width: 330px !important;
}
.${MENU_LIST_CLASS} [data-workspace-git-preset-row]:not(:last-child) {
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.${MENU_LIST_CLASS} [data-workspace-git-preset-row] {
  border-radius: var(--dsw-radius-md);
}
.${MENU_LIST_CLASS} [data-workspace-git-preset-row]:hover,
.${MENU_LIST_CLASS} [data-workspace-git-preset-row]:has([role="menuitem"]:focus-visible) {
  background: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover) 40%, #fff);
}
.${MENU_LIST_CLASS} [role="menuitem"]:hover:not(:disabled),
.${MENU_LIST_CLASS} [role="menuitem"]:focus-visible:not(:disabled) {
  background: transparent !important;
}
.${MENU_LIST_CLASS} [role="menuitem"] {
  align-items: flex-start;
  height: auto !important;
  max-height: none !important;
  min-height: 0 !important;
  white-space: normal;
}
.${MENU_LIST_CLASS} [role="menuitem"] > span {
  overflow: visible !important;
  text-overflow: unset !important;
  white-space: normal !important;
  height: auto !important;
  max-height: none !important;
}
`

function ensurePresetMenuStyles(): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(MENU_STYLE_ID)
  if (existing !== null) {
    existing.textContent = MENU_CSS
    return
  }
  const style = document.createElement('style')
  style.id = MENU_STYLE_ID
  style.textContent = MENU_CSS
  document.head.appendChild(style)
}

/**
 * The session list slice this chip reads to learn the session's preset.
 *
 * `blank` is the Host's own "this session has not run yet" flag, read from the
 * session summary itself (a sibling of `projectionValues`, not inside it). It
 * is the same field the official controller guards on — see
 * {@link AgentPresetChipProps} and the `canSwitch` computation below.
 */
interface SessionListLike {
  byId: Record<string, {
    projectionValues?: { agentPreset?: unknown }
    /** Present and `true` only while no message has been sent in this session. */
    blank?: unknown
  } | undefined>
}

/** Props the hero seat composes for this chip. */
export interface AgentPresetChipProps {
  /**
   * The session this seat occurrence draws. `undefined` on the new-session
   * screen before a session exists.
   */
  sessionId?: string
  /** The client session list selector hook supplied by the seat. */
  useSessions?: <T>(selector: (state: SessionListLike) => T) => T
  /** Namespace-bound translator supplied by the seat. */
  t?: (key: string) => string
  /** The plugin's preset store (supplied through the seat's inject factory). */
  store?: AgentPresetStore
}

/**
 * The chip.
 * @param props - the composed slot props.
 * @returns the chip and its menu, or null when there is nothing to show.
 */
export function AgentPresetChip({
  sessionId,
  useSessions,
  t,
  store,
}: AgentPresetChipProps): ReactNode {
  // The session's own preset, when it reports one. This is what makes the chip
  // describe the session the user is actually looking at rather than the
  // roster's default.
  const projected = useSessions?.((state) => {
    if (sessionId === undefined) return undefined
    const value = state.byId[sessionId]?.projectionValues?.agentPreset
    return typeof value === 'string' ? value : undefined
  })
  const sessionPreset = projected === '' ? undefined : projected
  // Whether this session is still blank — the precondition the Host enforces on
  // a preset change, read from the session summary.
  const sessionBlank = useSessions?.((state) => {
    if (sessionId === undefined) return false
    return state.byId[sessionId]?.blank === true
  }) ?? false
  const [open, setOpen] = useState(false)
  useEffect(() => {
    ensurePresetMenuStyles()
  }, [])
  const [guide, setGuide] = useState<{ id: string; page: GuidePage } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastSeq = useRef(0)
  const [revision, setRevision] = useState(0)

  // Re-render when a roster read or a selection settles.
  useEffect(() => {
    if (store === undefined) return
    return store.subscribe(() => { setRevision(value => value + 1) })
  }, [store])

  useEffect(() => {
    if (store === undefined) return
    void store.load(sessionPreset)
  }, [store, sessionPreset])

  // A session may not exist yet on the hero screen; without a store there is
  // nothing to draw and the seat must stay empty rather than reserve space.
  if (store === undefined) return null
  const label = (key: string, fallback: string): string => t?.(key) ?? fallback
  const state = store.getSnapshot()
  // `revision` is read so the subscription above is not treated as unused.
  void revision

  // No roster (or a deployment without the registry): render nothing, exactly
  // as the official chip does. The branch pill beside it follows the same rule.
  if (state.status === 'unavailable' || state.options.length === 0) return null
  const current = state.options.find(option => option.id === state.current)
  const currentId = current?.id ?? (state.current === '' ? undefined : state.current)
  if (currentId === undefined) return null

  // Switching needs a session that is still BLANK. The Host refuses to adopt an
  // existing session under a different preset — a running session keeps the
  // composition it began with — so a non-blank session is not a switchable
  // target, and offering the menu there would only produce a refusal.
  //
  // The official controller guards the same way, and it guards BEFORE calling
  // `select` rather than letting the Host reject it. That distinction is the
  // whole point: an unset `blank` (an older or thinner session list) must not be
  // read as "blank", so the comparison is `=== true`.
  const canSwitch = sessionId !== undefined && sessionId !== '' && sessionBlank

  const pick = (id: string): void => {
    setOpen(false)
    if (!canSwitch || store === undefined) return
    void store.select(sessionId, id).then((refusal) => {
      if (refusal === undefined) return
      toastSeq.current += 1
      setToast(label('switchRefused', 'Could not switch to {name}: {reason}')
        .replace('{name}', presetLabel(current, t))
        .replace('{reason}', refusal))
    })
  }

  const openHelp = (id: string, page: GuidePage): void => {
    setOpen(false)
    setGuide({ id, page })
  }

  const helpStyle = {
    border: 0,
    background: 'transparent',
    padding: 0,
    color: 'var(--dsw-alias-label-tertiary)',
    font: 'inherit',
    fontSize: '12px',
    lineHeight: '16px',
    cursor: 'pointer',
  }

  const activeGuide = guide === null ? undefined : presetGuide(guide.id)

  return (
    <>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        align="start"
        portal
        selectedId={state.current}
        listClassName={MENU_LIST_CLASS}
        anchor={(
          <button
            type="button"
            data-workspace-git-agent-preset=""
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`${label('agentPreset', 'Agent preset')}: ${presetLabel(current, t)}`}
            title={state.error ?? (canSwitch
              ? label('seatHint', 'Choose the agent preset for your new task')
              : label('lockedHint', 'This session already started with a preset'))}
            disabled={state.busy || !canSwitch}
            onClick={() => { setOpen(value => !value) }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = e.currentTarget.getAttribute('aria-expanded') === 'true'
                ? 'var(--dsw-alias-interactive-bg-hover)'
                : 'transparent'
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              maxWidth: '220px',
              minHeight: '28px',
              height: '28px',
              padding: '0 8px',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              borderRadius: 'var(--dsw-radius-sm)',
              background: open ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
              color: 'var(--dsw-alias-label-secondary)',
              font: 'inherit',
              fontSize: '13px',
              fontWeight: 500,
              lineHeight: '20px',
              cursor: state.busy || !canSwitch ? 'default' : 'pointer',
              opacity: state.busy || !canSwitch ? 0.6 : 1,
            }}
          >
            <span
              aria-hidden="true"
              style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit', flex: 'none' }}
            >
              <AgentPresetIcon size={15} />
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {presetLabel(current, t)}
            </span>
            <span aria-hidden="true" style={{ flex: 'none', fontSize: '10px', opacity: 0.7 }}>▾</span>
          </button>
        )}
      >
        {state.options.map((option) => {
          const text = presetDisplay(option, t)
          const help = presetGuide(option.id)
          const selected = option.id === state.current
          return (
            <div key={option.id} data-workspace-git-preset-row={option.id}>
              <MenuItemButton
                disabled={state.busy || !canSwitch}
                onSelect={() => { pick(option.id) }}
              >
                <span
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    minWidth: 0,
                    width: '100%',
                    height: 'auto',
                    overflow: 'visible',
                    whiteSpace: 'normal',
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      lineHeight: '20px',
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{text.name}</span>
                    {selected ? (
                      <>
                        {' '}
                        <Tag tone="info">
                          <span data-workspace-git-preset-selected="">
                            {label('selectedTag', 'Selected')}
                          </span>
                        </Tag>
                      </>
                    ) : null}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      lineHeight: '16px',
                      color: 'var(--dsw-alias-label-tertiary)',
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {text.description ?? label('noDescription', 'No description.')}
                  </span>
                </span>
              </MenuItemButton>
              {help === undefined ? null : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    // Match MenuItemButton's 8px horizontal pad so the help
                    // actions line up with the mode name, not the card edge.
                    padding: '0 8px 8px',
                  }}
                >
                  <button
                    type="button"
                    data-workspace-git-preset-guide="explanation"
                    aria-label={`${label('modeExplanation', 'Mode details')}: ${text.name}`}
                    style={helpStyle}
                    onClick={(event) => {
                      event.stopPropagation()
                      openHelp(option.id, 'explanation')
                    }}
                  >
                    {label('modeExplanation', 'Mode details')}
                  </button>
                  <button
                    type="button"
                    data-workspace-git-preset-guide="usage"
                    aria-label={`${label('howToUse', 'How to use')}: ${text.name}`}
                    style={helpStyle}
                    onClick={(event) => {
                      event.stopPropagation()
                      openHelp(option.id, 'usage')
                    }}
                  >
                    {label('howToUse', 'How to use')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </Menu>
      {activeGuide !== undefined && guide !== null ? (
        <PresetGuideDialog
          guide={activeGuide}
          initialPage={guide.page}
          t={t}
          onClose={() => { setGuide(null) }}
        />
      ) : null}
      {toast !== null ? (
        <Toast
          key={toastSeq.current}
          text={toast}
          holdMs={REFUSAL_HOLD_MS}
          anchor={document.querySelector<HTMLElement>('[data-composer-card]')}
          onDone={() => { setToast(null) }}
        />
      ) : null}
    </>
  )
}
