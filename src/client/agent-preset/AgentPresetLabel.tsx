/**
 * The agent-preset label for `conversation.session.header.actions` — the
 * session header's action row, where the official plugin also puts a read-only
 * preset label (at order -10, so it sits leftmost).
 *
 * Read-only by design, and that is not a limitation of this plugin: switching a
 * preset is a session-creation-time decision on the Host, and the header is
 * showing a session that already runs. The chip on the hero screen is the
 * control; this is the ambient reminder of which preset the session you are
 * looking at is running.
 *
 * Order -10 matches the official registrant, so if both are ever visible the
 * two labels group together at the left of the action row instead of
 * interleaving with the other actions. The slot is a `list`, so unlike the hero
 * seat there is no single-occupant conflict — registering here is safe
 * regardless of the official plugin.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { AgentPresetStore } from './store.ts'
import { AgentPresetIcon } from './AgentPresetIcon.tsx'
import { presetLabel } from './labels.ts'

/** The session list slice this label reads to learn the session's preset. */
interface SessionListLike {
  byId: Record<string, { projectionValues?: { agentPreset?: unknown } } | undefined>
}

/** A boolean setting exposed by the client runtime as a snapshot source. */
interface BooleanSnapshotSource {
  getSnapshot(): boolean
  subscribe(listener: () => void): () => void
}

/** Props the header seat composes for this label. */
export interface AgentPresetLabelProps {
  /** The session this seat occurrence draws. */
  sessionId?: string
  /** The client session list selector hook supplied by the seat. */
  useSessions?: <T>(selector: (state: SessionListLike) => T) => T
  /** Namespace-bound translator supplied by the seat. */
  t?: (key: string) => string
  /** The plugin's preset store (supplied through the seat's inject factory). */
  store?: AgentPresetStore
  /**
   * The Developer-tools setting, when this deployment mounts it.
   *
   * The official plugin's header label is NOT gated on this setting (only its
   * hero chip is), so with Developer tools on it is already showing. This label
   * therefore stays out of the way then, and appears when the setting is off.
   * Omitted when the deployment has no such setting.
   */
  developerTools?: BooleanSnapshotSource
}

/**
 * The label.
 * @param props - the composed slot props.
 * @returns the label, or null when no roster/preset is known.
 */
export function AgentPresetLabel({
  sessionId,
  useSessions,
  t,
  store,
  developerTools,
}: AgentPresetLabelProps): ReactNode {
  const [revision, setRevision] = useState(0)
  const [developerToolsOn, setDeveloperToolsOn] = useState(
    () => developerTools?.getSnapshot() ?? false,
  )
  // The session's own preset. The header seat is session-scoped and hands this
  // occurrence its `sessionId`, so the label describes exactly the session it
  // is mounted under rather than whichever row happens to come first.
  const sessionPreset = useSessions?.((state) => {
    if (sessionId === undefined) return undefined
    const value = state.byId[sessionId]?.projectionValues?.agentPreset
    return typeof value === 'string' && value !== '' ? value : undefined
  })

  useEffect(() => {
    if (store === undefined) return
    return store.subscribe(() => { setRevision(value => value + 1) })
  }, [store])

  useEffect(() => {
    if (developerTools === undefined) return
    setDeveloperToolsOn(developerTools.getSnapshot())
    return developerTools.subscribe(() => { setDeveloperToolsOn(developerTools.getSnapshot()) })
  }, [developerTools])

  useEffect(() => {
    if (store === undefined) return
    void store.load(sessionPreset)
  }, [store, sessionPreset])

  // The official label already covers this with Developer tools on.
  if (developerToolsOn) return null

  if (store === undefined) return null
  void revision
  const state = store.getSnapshot()
  if (state.status !== 'ready' || state.options.length === 0) return null
  const current = state.options.find(option => option.id === state.current)
  if (current === undefined) return null

  const label = (key: string, fallback: string): string => t?.(key) ?? fallback
  const hint = `${label('agentPresetHint', 'Agent preset for this session')}: ${presetLabel(current, t)}`

  return (
    <span
      data-workspace-git-agent-preset-label=""
      title={hint}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        height: '24px',
        padding: '0 8px',
        borderRadius: '999px',
        background: 'var(--dsw-alias-bg-module-platform)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '12px',
        lineHeight: '16px',
        maxWidth: '180px',
      }}
    >
      <span
        aria-hidden="true"
        style={{ display: 'inline-flex', alignItems: 'center', flex: 'none', color: 'inherit' }}
      >
        <AgentPresetIcon size={13} />
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {presetLabel(current, t)}
      </span>
    </span>
  )
}
