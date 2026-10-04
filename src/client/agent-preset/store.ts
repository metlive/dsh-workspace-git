/**
 * The agent-preset store: the roster the official chip would show, read through
 * the SAME Host remote namespace (`ctx.remote.agentPresets`) — but without the
 * Developer-tools gate the official client plugin applies on top.
 *
 * Why a store of our own rather than reusing the official one:
 *
 *   `@deepseek-ai/dsh-client-ui-agent-preset` registers into
 *   `conversation.hero.agentPreset` and then returns null whenever
 *   General → Developer tools is off (`ap-client.js:480`). That seat is a
 *   `single` slot, so the official registrant keeps the position even while
 *   rendering nothing — the empty space beside "选择工作区". We cannot make its
 *   component render, and we must not register a second occupant of a `single`
 *   seat. So we read the same Host data ourselves and render the control.
 *
 * The gate is a pure client-side display rule, not a Host restriction: the
 * `agentPresets.list` and `agentPresets.select` remote methods answer
 * regardless. Bypassing it therefore needs no Host change and no patched
 * package — which is the whole point, since the official package lives inside
 * the signed app bundle and any edit there dies on the next upgrade.
 *
 * Mirrors the upstream read path, including its two deliberate behaviors:
 *   - `gateway/invocation-unavailable` means the deployment composes no
 *     presets; that is a valid deployment, not an error, so it reads as an
 *     empty roster and every surface renders nothing.
 *   - only the newest read may publish, so overlapping refreshes cannot let a
 *     stale roster win.
 */
import type { AgentPresetAnswer, AgentPresetOption, AgentPresetsRemote } from './api.ts'
import { readRoster, selectPreset } from './api.ts'

/** How a roster read stands. */
export type AgentPresetStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

/** The snapshot every surface renders from. */
export interface AgentPresetState {
  status: AgentPresetStatus
  /** Selectable presets, broken entries already dropped. */
  options: AgentPresetOption[]
  /** The preset the next/current session would use. */
  current: string
  /** The last read or selection failure, for the surface's title/alert. */
  error: string | null
  /** Whether a selection is in flight. */
  busy: boolean
}

/** The state a store starts in. */
const INITIAL: AgentPresetState = {
  status: 'idle',
  options: [],
  current: '',
  error: null,
  busy: false,
}

/**
 * One roster read shared by every surface of this plugin.
 *
 * `subscribe` mirrors the official snapshot stores, so a component re-renders
 * when a read or a selection settles.
 */
export class AgentPresetStore {
  private state: AgentPresetState = INITIAL
  private readonly listeners = new Set<() => void>()
  /** Only the newest read may publish after overlapping refreshes. */
  private generation = 0
  /** The roster's own default, used when no session override is known. */
  private fallback = ''
  /** The active read, so concurrent callers join it instead of double-fetching. */
  private inFlight: Promise<void> | undefined

  /**
   * @param remote - the client remote service (`ctx.remote`).
   */
  constructor(private readonly remote: AgentPresetsRemote) {}

  /** The current snapshot. */
  getSnapshot(): AgentPresetState {
    return this.state
  }

  /**
   * Observe snapshot changes.
   * @param listener - called after every publish.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private set(patch: Partial<AgentPresetState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /**
   * Read the roster. Joined by concurrent callers, so the hero chip and the
   * header label mounting together cause one request.
   *
   * @param sessionPreset - the current session's preset when it has one; the
   *   chip opens on that rather than on the roster default.
   * @returns once the snapshot reflects the Host (or the read failed).
   */
  async load(sessionPreset?: string): Promise<void> {
    if (this.inFlight !== undefined) return await this.inFlight
    const run = this.read(sessionPreset).finally(() => { this.inFlight = undefined })
    this.inFlight = run
    return await run
  }

  private async read(sessionPreset?: string): Promise<void> {
    const generation = ++this.generation
    this.set({ status: 'loading' })
    const roster = await readRoster(this.remote)
    if (generation !== this.generation) return
    if (!roster.ok) {
      this.set({ status: 'unavailable', options: [], error: roster.error })
      return
    }
    const { presets } = roster.value
    if (presets.length === 0) {
      this.set({ status: 'unavailable', options: [], error: null })
      return
    }
    this.fallback = presets.find(preset => preset.isDefault)?.id ?? presets[0]?.id ?? ''
    this.set({
      status: 'ready',
      error: null,
      options: presetOptions(presets),
      current: sessionPreset ?? this.fallback,
    })
  }

  /**
   * Switch the session to a preset.
   *
   * The refusal text is RETURNED as well as stored: the caller that made the
   * pick is the one that has to say why it did not take (the label alone cannot
   * carry a per-pick explanation).
   *
   * @param sessionId - the session to switch.
   * @param id - the preset to select.
   * @returns the Host refusal text, or undefined once the pick settled.
   */
  async select(sessionId: string, id: string): Promise<string | undefined> {
    if (this.state.busy) return undefined
    if (id === this.state.current) return undefined
    const previous = this.state.current
    // Optimistic: the chip should follow the click immediately, and the
    // rollback below restores the truth if the Host refuses.
    this.set({ busy: true, error: null, current: id })
    try {
      const result = await selectPreset(this.remote, sessionId, id)
      if (!result.ok) {
        this.set({ error: result.error, current: previous })
        return result.error
      }
      this.set({ current: result.value })
      return undefined
    } finally {
      this.set({ busy: false })
    }
  }

  /** Release listeners. Called from the plugin's effect disposer. */
  dispose(): void {
    this.listeners.clear()
  }
}

/**
 * Map roster rows to selectable options, dropping entries the Host marked
 * broken — the official surface does the same, so a preset that failed to load
 * is not offered as a choice.
 * @param presets - the roster rows.
 * @returns the selectable options.
 */
function presetOptions(presets: readonly AgentPresetAnswer[]): AgentPresetOption[] {
  return presets
    .filter(preset => preset.broken === undefined)
    .map(preset => ({
      id: preset.id,
      ...preset.name === undefined ? {} : { name: preset.name },
      ...preset.description === undefined ? {} : { description: preset.description },
    }))
}
