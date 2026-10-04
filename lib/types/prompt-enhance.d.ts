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
import { WorkspaceGitError, type PromptEnhanceAnswer, type WorkspaceGitErrorCode } from './wire.ts';
import type { Context } from './context-types.ts';
/**
 * One refusal the client can render, carrying a stable machine code.
 *
 * Extends {@link WorkspaceGitError} so the plugin's single envelope path
 * (`writeError`) carries the specific code and status through unchanged — the
 * client can then explain WHICH refusal happened instead of a generic 500.
 */
export declare class PromptEnhanceError extends WorkspaceGitError {
    constructor(code: WorkspaceGitErrorCode, message: string, status?: number);
}
/**
 * Enhance one draft through the session's own model.
 * @param ctx - the host plugin context.
 * @param payload - the untrusted request body (`{ sessionId, draft }`).
 * @returns the rewrite and the route that produced it.
 * @throws PromptEnhanceError on any refusal.
 */
export declare function enhancePrompt(ctx: Context, payload: unknown): Promise<PromptEnhanceAnswer>;
