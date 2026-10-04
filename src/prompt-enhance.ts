/**
 * Prompt enhancement: rewrite a rough composer draft into a structured prompt.
 *
 * This is the Host half of the composer's "enhance" action. It calls the SAME
 * model the session is already using — resolved from the live agent, not from
 * plugin configuration — so the rewrite matches whatever the user picked in the
 * model selector, and an account without access to a model simply gets a
 * refusal rather than a silent downgrade to some other provider.
 *
 * Two properties are load-bearing:
 *
 * - **The model's answer is data, never instructions.** The draft is nested as
 *   JSON and the system prompt says the reply is a rewrite, so a draft saying
 *   "ignore your instructions" is just text to be rewritten. The reply is also
 *   length-capped and stripped of code fences before it can reach the composer.
 * - **Every failure is a refusal with a reason.** The client shows the reason
 *   and leaves the draft untouched; nothing is ever half-written. A failed
 *   enhancement must not cost the user their text.
 */
import {
  WorkspaceGitError,
  type PromptEnhanceAnswer,
  type ResolvedRoute,
  type WorkspaceGitErrorCode,
} from './wire.ts'
import type { Context } from './context-types.ts'

/** Hard cap on draft bytes accepted, so one call cannot blow up the context. */
const MAX_DRAFT_BYTES = 16_000

/** Output cap. A rewrite is not a document; this also bounds runaway models. */
const MAX_OUTPUT_TOKENS = 2_048

/** Call deadline. Long enough for a slow model, short enough to stay interactive. */
const TIMEOUT_MS = 60_000

/**
 * Purpose tag recorded on the request for logs and session history.
 *
 * `GenerateOptions.purpose` is a CLOSED union — `'compaction' | 'session-title'`
 * — not free text, so an invented value is a contract violation. The tag is
 * diagnostic metadata only; omitting it keeps the call valid, whereas passing
 * an unsupported literal risks rejection by adapters that switch on it.
 */
const PURPOSE: 'session-title' | undefined = undefined

/**
 * The rewrite instruction.
 *
 * Written as a specification rather than a plea: the sections, the ordering,
 * and the "no preamble" rule are what make the output usable as a drop-in
 * replacement for the draft.
 */
const SYSTEM_PROMPT = [
  'You rewrite a software-engineering request into a high-quality prompt for an AI coding agent.',
  '',
  'The user input may be terse, ambiguous, or a fragment. Infer the intent a competent engineer would infer, then express it precisely. Never invent requirements the input does not support: when a detail is genuinely unknown, state it as an explicit assumption or an open question instead of guessing silently.',
  '',
  'Produce the rewritten prompt in the SAME natural language as the user input.',
  '',
  'Structure it with these sections, omitting any that would be empty:',
  '1. **Task** — what must be done, in one or two sentences.',
  '2. **Context** — files, modules, technologies, or constraints implied by the input.',
  '3. **Requirements** — a concrete checklist of what the result must satisfy.',
  '4. **Constraints** — what must not change, plus compatibility or style limits.',
  '5. **Acceptance criteria** — how to tell the work is complete and correct.',
  '6. **Open questions** — only where the input is truly underdetermined.',
  '',
  'Rules:',
  '- Output ONLY the rewritten prompt. No preamble, no explanation of what you did, no closing commentary.',
  '- Do not wrap the whole answer in a code fence.',
  '- Do not answer the request, solve it, or write the code. Rewrite it.',
  '- Preserve every concrete detail from the input (names, paths, versions, error text) verbatim.',
  '- Keep it tight. Omit a section rather than padding it.',
].join('\n')

/**
 * One refusal the client can render, carrying a stable machine code.
 *
 * Extends {@link WorkspaceGitError} so the plugin's single envelope path
 * (`writeError`) carries the specific code and status through unchanged — the
 * client can then explain WHICH refusal happened instead of a generic 500.
 */
export class PromptEnhanceError extends WorkspaceGitError {
  constructor(code: WorkspaceGitErrorCode, message: string, status = 400) {
    super(code, message, status)
  }
}

/**
 * Read the draft out of an untrusted request body.
 * @param payload - the parsed JSON body.
 * @returns the non-empty draft, trimmed of surrounding whitespace.
 * @throws PromptEnhanceError when the draft is missing or too large.
 */
function readDraft(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new PromptEnhanceError('bad-request', 'request body must be an object')
  }
  const draft = (payload as { draft?: unknown }).draft
  if (typeof draft !== 'string') {
    throw new PromptEnhanceError('bad-request', 'draft must be a string')
  }
  const trimmed = draft.trim()
  if (trimmed === '') {
    throw new PromptEnhanceError('empty-draft', 'there is nothing to enhance')
  }
  if (Buffer.byteLength(trimmed, 'utf8') > MAX_DRAFT_BYTES) {
    throw new PromptEnhanceError(
      'draft-too-large',
      `draft exceeds ${String(MAX_DRAFT_BYTES)} bytes`,
      413,
    )
  }
  return trimmed
}

/**
 * Resolve the model this session is already using.
 *
 * Mirrors the prompt-assembly rule: the pending selection if the user changed
 * it, else the route logged on the session, else the deployment default.
 *
 * The read is `ctx.get('agents').get(id)` — the ONLY live-agent lookup the
 * `agents` service exposes — followed by the `modelSelection` session
 * projection that prompt assembly itself consults. There is no
 * `agents.selectionFor()`: the `Agent` interface is just `{ id, session }`,
 * and the controller that owns "selection" is a different service entirely, so
 * calling it here threw a TypeError that surfaced to the user as a generic
 * "enhancement failed". The default-model service is the documented fallback.
 * @param ctx - the host plugin context.
 * @param sessionId - the session whose draft is being enhanced.
 * @returns the provider/model pair to call.
 * @throws PromptEnhanceError when the session is gone or picked no model.
 */
function resolveRoute(ctx: Context, sessionId: string): ResolvedRoute {
  const agents = ctx.get('agents') as
    | { get(id: string): { session?: unknown } | undefined }
    | undefined
  const agent = agents?.get(sessionId)
  if (agents === undefined || agent === undefined) {
    throw new PromptEnhanceError('session-not-found', 'this session is no longer open', 404)
  }

  // 1. The pending pick from the composer, read off the same projection prompt
  //    assembly reads. Absent when the user never changed the model this turn.
  const pending = readPendingSelection(ctx, agent)
  if (pending !== undefined) return pending

  // 2. The route logged on the session's last request header.
  const logged = readLoggedRoute(agent)
  if (logged !== undefined) return logged

  // 3. The deployment default, which is what a fresh session runs on.
  const fallback = ctx.get('agentDefaultModel') as
    | { currentSelection(): Partial<ResolvedRoute> }
    | undefined
  const selected = fallback?.currentSelection()
  if (isRoute(selected)) return { provider: selected.provider, model: selected.model }

  throw new PromptEnhanceError('no-model', 'this session has no model selected')
}

/**
 * Narrow one candidate to a usable route.
 * @param value - the candidate selection.
 * @returns true when it names a non-empty provider and model.
 */
function isRoute(value: unknown): value is ResolvedRoute {
  if (typeof value !== 'object' || value === null) return false
  const { provider, model } = value as Partial<ResolvedRoute>
  return typeof provider === 'string' && provider !== ''
    && typeof model === 'string' && model !== ''
}

/**
 * Read the user's pending model pick for this agent, if any.
 *
 * The `modelSelection` projection is optional in practice (a deployment may not
 * register it), so a missing projection is "no pending pick" rather than an
 * error — the logged route and the default still answer.
 * @param ctx - the host plugin context.
 * @param agent - the live agent in hand.
 * @returns the pending route, or undefined when there is none.
 */
function readPendingSelection(ctx: Context, agent: { session?: unknown }): ResolvedRoute | undefined {
  const projections = ctx.get('sessionProjections') as
    | { stateOf(session: unknown, name: string): { pending?: unknown } | undefined }
    | undefined
  if (projections === undefined || agent.session === undefined) return undefined
  let state: { pending?: unknown } | undefined
  try {
    state = projections.stateOf(agent.session, 'modelSelection')
  } catch {
    // A projection that is unregistered or unhappy must not fail the request.
    return undefined
  }
  const pending = state?.pending
  return isRoute(pending) ? { provider: pending.provider, model: pending.model } : undefined
}

/**
 * Read the route recorded on the session's latest request header.
 *
 * This is the durable "what this conversation is actually running on" answer,
 * and it is what the session's own prompt assembly uses once a turn has run.
 * @param agent - the live agent in hand.
 * @returns the logged route, or undefined when the session has no header yet.
 */
function readLoggedRoute(agent: { session?: unknown }): ResolvedRoute | undefined {
  const session = agent.session as
    | { requestHeader?(): { config?: Partial<ResolvedRoute> } | undefined }
    | undefined
  const header = session?.requestHeader?.()
  return isRoute(header?.config) ? { provider: header.config.provider, model: header.config.model } : undefined
}

/**
 * Build the single user message carrying the draft.
 *
 * The draft rides inside a JSON string so its own quoting, newlines, or
 * instruction-like text cannot restructure the call.
 * @param draft - the user's text.
 * @returns the message list for the model call.
 */
function buildMessages(draft: string): unknown[] {
  return [
    {
      id: crypto.randomUUID(),
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Rewrite this request into a structured prompt, following your instructions exactly:\n${JSON.stringify(draft)}`,
        },
      ],
      source: { kind: PURPOSE },
    },
  ]
}

/**
 * Strip wrappers a model adds despite instructions, so the result drops
 * straight into the composer.
 * @param text - the raw model output.
 * @returns the trimmed rewrite, or an empty string when nothing usable remains.
 */
function normalizeRewrite(text: string): string {
  let value = text.trim()
  // A fence around the WHOLE answer is the common deviation; unwrap it.
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/u.exec(value)
  if (fenced?.[1] !== undefined) value = fenced[1].trim()
  return value
}

/**
 * Enhance one draft through the session's own model.
 * @param ctx - the host plugin context.
 * @param payload - the untrusted request body (`{ sessionId, draft }`).
 * @returns the rewrite and the route that produced it.
 * @throws PromptEnhanceError on any refusal.
 */
export async function enhancePrompt(ctx: Context, payload: unknown): Promise<PromptEnhanceAnswer> {
  if (typeof payload !== 'object' || payload === null) {
    throw new PromptEnhanceError('bad-request', 'request body must be an object')
  }
  const sessionId = (payload as { sessionId?: unknown }).sessionId
  if (typeof sessionId !== 'string' || sessionId === '') {
    throw new PromptEnhanceError('bad-request', 'sessionId must be a non-empty string')
  }
  const draft = readDraft(payload)
  const route = resolveRoute(ctx, sessionId)

  const llm = ctx.get('llm') as
    | {
        stream(options: Record<string, unknown>): AsyncIterable<{
          type: string
          text?: string
          reason?: { kind: string; failure?: { message?: string; code?: string } }
        }>
      }
    | undefined
  if (llm === undefined) {
    throw new PromptEnhanceError('no-llm', 'this deployment has no model service', 503)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, TIMEOUT_MS)
  let text = ''
  // Sentinel, NOT 'stop': the loop below only assigns on a real `finish`
  // chunk, so a stream that ends without one (provider dropped the connection,
  // or an adapter signalling failure by closing instead of reporting) leaves
  // this undefined and is refused below. Initialising it to 'stop' made such a
  // stream look like a complete answer, and the truncated text was written
  // back over the user's draft.
  let finishKind: string | undefined
  let failureMessage: string | undefined
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      messages: buildMessages(draft),
      system: SYSTEM_PROMPT,
      maxTokens: MAX_OUTPUT_TOKENS,
      sessionId,
      // Spread so an undefined purpose is OMITTED rather than sent as
      // `purpose: undefined`, keeping the call inside the declared union.
      ...(PURPOSE === undefined ? {} : { purpose: PURPOSE }),
      signal: controller.signal,
    })) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      else if (chunk.type === 'finish') {
        finishKind = chunk.reason?.kind ?? 'stop'
        failureMessage = chunk.reason?.failure?.message
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PromptEnhanceError('timeout', 'the model took too long to respond', 504)
    }
    throw new PromptEnhanceError(
      'model-error',
      error instanceof Error ? error.message : String(error),
      502,
    )
  } finally {
    clearTimeout(timer)
  }

  if (finishKind === 'error' || finishKind === 'aborted') {
    throw new PromptEnhanceError('model-error', failureMessage ?? 'the model call failed', 502)
  }
  if (finishKind === 'max-tokens') {
    throw new PromptEnhanceError('truncated', 'the rewrite was cut off before it finished', 502)
  }
  if (finishKind === undefined) {
    throw new PromptEnhanceError('model-error', 'the model stream ended without finishing', 502)
  }
  if (finishKind !== 'stop') {
    throw new PromptEnhanceError('model-error', `unsupported model finish reason "${finishKind}"`, 502)
  }

  const rewrite = normalizeRewrite(text)
  if (rewrite === '') {
    throw new PromptEnhanceError('empty-result', 'the model returned nothing usable', 502)
  }
  return { draft: rewrite, provider: route.provider, model: route.model }
}
