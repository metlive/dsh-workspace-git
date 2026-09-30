/**
 * Wire helpers for the plugin's JSON API: bounded body reading and the
 * `{ok: true, value}` / `{ok: false, error: {code, message}}` envelope every
 * DSH route speaks, so the client has exactly one response shape to parse.
 */
import type { PluginHttpRequest, PluginHttpResponse } from './context-types.ts';
/** Machine-readable error codes of this plugin's API. */
export type WorkspaceGitErrorCode = 'bad-request' | 'method-error' | 'forbidden' | 'too-large' | 'internal';
/** One API failure with its wire code and HTTP status. */
export declare class WorkspaceGitError extends Error {
    readonly code: WorkspaceGitErrorCode;
    readonly status: number;
    constructor(code: WorkspaceGitErrorCode, message: string, status?: number);
}
/** Write one JSON response. */
export declare function writeJson(res: PluginHttpResponse, status: number, body: unknown): void;
/** Write the success envelope. */
export declare function writeOk(res: PluginHttpResponse, value: unknown): void;
/**
 * Write the failure envelope for any thrown value.
 *
 * An unknown error is reported as `internal` with its message, which is the
 * only place a raw error text reaches the client — the client renders nothing
 * for a failure anyway (see the silent-failure contract in the README), so this
 * exists for the network panel and for tests, not for the user.
 */
export declare function writeError(res: PluginHttpResponse, error: unknown): void;
/**
 * Read and parse one JSON request body, bounded by {@link MAX_BODY_BYTES}.
 *
 * Chunks arrive as strings or bytes depending on the server's encoding setup,
 * so both are accepted and concatenated before parsing.
 * @param req - the incoming request.
 * @returns the parsed body.
 * @throws WorkspaceGitError on an oversized, empty, or malformed body.
 */
export declare function readJsonBody(req: PluginHttpRequest): Promise<unknown>;
