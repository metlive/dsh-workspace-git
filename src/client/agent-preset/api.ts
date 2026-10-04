/**
 * The agent-preset roster API: a thin, typed wrapper over the Host remote
 * namespace `agentPresets` (`@deepseek-ai/dsh-agent-preset-registry`).
 *
 * This is the SAME Host surface the official client plugin uses; only the
 * presentation differs (see `store.ts` for why this plugin reads it itself).
 *
 * Wire contract, taken from the generated Host FaceModel
 * (`dsh-agent-preset-registry/lib/typert.remote-client.js`):
 *
 *   agentPresets.list()            -> { presets: [{ id, isDefault, name?,
 *                                                     description?, broken? }] }
 *   agentPresets.select(sessionId, presetId) -> string   (the effective preset)
 *
 * Every `remote` call resolves to a result envelope — `{ ok: true, value }` or
 * `{ ok: false, error: { code, message } }` — never a throw, so the failure
 * branch is data here rather than an exception.
 *
 * The remote service is reached structurally (no import of the DSH package), so
 * this plugin keeps building against its own small dependency set; the shapes
 * below are the only part of that package this plugin depends on.
 */

/** One roster row as the Host answers it. */
export interface AgentPresetAnswer {
  id: string
  isDefault: boolean
  name?: string
  description?: string
  /** Present when the preset failed to compose; the row is then not offerable. */
  broken?: string
}

/** The roster answer. */
export interface AgentPresetRoster {
  presets: readonly AgentPresetAnswer[]
}

/** One selectable preset, with the roster's optional display copy. */
export interface AgentPresetOption {
  id: string
  name?: string
  description?: string
}

/** A remote failure as the gateway reports it. */
export interface RemoteFailure {
  code: string
  message: string
}

/** The result envelope every remote method resolves to. */
export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RemoteFailure }

/** The `agentPresets` namespace face this plugin calls. */
export interface AgentPresetsRemoteNamespace {
  list(): Promise<RemoteResult<AgentPresetRoster>>
  select(sessionId: string, presetId: string): Promise<RemoteResult<string>>
}

/**
 * The client remote service face. Only the namespace this plugin uses is
 * declared; the real service carries many more.
 */
export interface AgentPresetsRemote {
  agentPresets: AgentPresetsRemoteNamespace
}

/**
 * Read the roster, normalizing the one non-failure case that matters.
 *
 * `gateway/invocation-unavailable` means this deployment mounts no agent-preset
 * registry at all. That is a valid deployment rather than a failure, so it is
 * reported as an empty roster and every surface renders nothing — the same
 * reading the official plugin applies.
 *
 * @param remote - the client remote service.
 * @returns the roster, or the message to show in its place.
 */
export async function readRoster(
  remote: AgentPresetsRemote,
): Promise<{ ok: true; value: AgentPresetRoster } | { ok: false; error: string }> {
  const result = await remote.agentPresets.list()
  if (result.ok) return { ok: true, value: result.value }
  if (result.error.code === 'gateway/invocation-unavailable') {
    return { ok: true, value: { presets: [] } }
  }
  return { ok: false, error: result.error.message }
}

/**
 * Select a preset for one session.
 *
 * The refusal reason is preferred over the bare message because the Host puts
 * the human-readable cause in `error.details.reason` (for example "session is
 * running"); the message alone is generic.
 *
 * @param remote - the client remote service.
 * @param sessionId - the session to switch.
 * @param presetId - the preset to select.
 * @returns the effective preset on success, or the refusal text.
 */
export async function selectPreset(
  remote: AgentPresetsRemote,
  sessionId: string,
  presetId: string,
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const result = await remote.agentPresets.select(sessionId, presetId)
  if (result.ok) return { ok: true, value: result.value }
  return { ok: false, error: refusalText(result.error) }
}

/**
 * Extract the human-readable refusal from a remote failure.
 * @param error - the failure envelope's error.
 * @returns the reason when the Host supplied one, else the message.
 */
function refusalText(error: RemoteFailure & { details?: unknown }): string {
  const details = error.details
  if (details !== null && typeof details === 'object' && 'reason' in details) {
    const reason = (details as { reason?: unknown }).reason
    if (typeof reason === 'string') return reason
  }
  return error.message
}
