/**
 * Wire helpers for the plugin's JSON API: bounded body reading and the
 * `{ok: true, value}` / `{ok: false, error: {code, message}}` envelope every
 * DSH route speaks, so the client has exactly one response shape to parse.
 */
import type { PluginHttpRequest, PluginHttpResponse } from './context-types.ts'

/** Machine-readable error codes of this plugin's API. */
export type WorkspaceGitErrorCode =
  | 'bad-request'
  | 'method-error'
  | 'forbidden'
  | 'too-large'
  | 'internal'
  // Prompt enhancement refusals. Each is a distinct, user-explicable outcome:
  // the client shows the reason and leaves the composer untouched.
  | 'empty-draft'
  | 'draft-too-large'
  | 'session-not-found'
  | 'no-model'
  | 'no-llm'
  | 'timeout'
  | 'truncated'
  | 'empty-result'
  | 'model-error'

/** The provider/model pair one auxiliary call runs on. */
export interface ResolvedRoute {
  provider: string
  model: string
}

/** The `enhance-prompt` method's result: the rewrite and what produced it. */
export interface PromptEnhanceAnswer {
  /** The rewritten prompt, ready to replace the draft. */
  draft: string
  /** Provider that answered (echoed for logs and diagnostics). */
  provider: string
  /** Model that answered (echoed for logs and diagnostics). */
  model: string
}

/** One API failure with its wire code and HTTP status. */
export class WorkspaceGitError extends Error {
  constructor(
    readonly code: WorkspaceGitErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** Body size bound of one JSON request (defense against unbounded reads). */
const MAX_BODY_BYTES = 1 << 18

/** Write one JSON response. */
export function writeJson(res: PluginHttpResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

/** Write the success envelope. */
export function writeOk(res: PluginHttpResponse, value: unknown): void {
  writeJson(res, 200, { ok: true, value })
}

/** HTTP status matching one error code. */
function statusOf(error: WorkspaceGitError): number {
  switch (error.code) {
    case 'forbidden': return 403
    case 'too-large': return 413
    case 'method-error': return 405
    case 'internal': return 500
    case 'draft-too-large': return 413
    case 'session-not-found': return 404
    case 'no-llm': return 503
    case 'timeout': return 504
    // Model-side refusals: the request was fine, the call was not.
    case 'truncated':
    case 'empty-result':
    case 'model-error': return 502
    default: return 400
  }
}

/**
 * Write the failure envelope for any thrown value.
 *
 * An unknown error is reported as `internal` with its message, which is the
 * only place a raw error text reaches the client — the client renders nothing
 * for a failure anyway (see the silent-failure contract in the README), so this
 * exists for the network panel and for tests, not for the user.
 */
export function writeError(res: PluginHttpResponse, error: unknown): void {
  const failure = error instanceof WorkspaceGitError
    ? error
    : new WorkspaceGitError('internal', error instanceof Error ? error.message : String(error))
  writeJson(res, statusOf(failure), { ok: false, error: { code: failure.code, message: failure.message } })
}

/**
 * Read and parse one JSON request body, bounded by {@link MAX_BODY_BYTES}.
 *
 * Chunks arrive as strings or bytes depending on the server's encoding setup,
 * so both are accepted and concatenated before parsing.
 * @param req - the incoming request.
 * @returns the parsed body.
 * @throws WorkspaceGitError on an oversized, empty, or malformed body.
 */
export async function readJsonBody(req: PluginHttpRequest): Promise<unknown> {
  const chunks: string[] = []
  let size = 0
  for await (const chunk of req) {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    size += Buffer.byteLength(text)
    if (size > MAX_BODY_BYTES) {
      throw new WorkspaceGitError('too-large', 'request body too large', 413)
    }
    chunks.push(text)
  }
  const raw = chunks.join('')
  if (raw === '') return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new WorkspaceGitError('bad-request', 'request body is not valid JSON')
  }
}
