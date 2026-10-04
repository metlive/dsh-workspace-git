/**
 * The prompt-enhancer control: one icon button in the composer's left cluster.
 *
 * ## Why this seat
 *
 * It registers into `conversation.input.right` — the compact-control run in the
 * composer's TRAILING cluster, which `ui-conversation` renders immediately left
 * of the model selector. It deliberately does NOT sit in `conversation.input.left`
 * beside the branch pill: that cluster and the model selector are separate
 * containers, so the rightmost occupant of `input.left` is still a whole cluster
 * away from the picker. The runtime's own contract for this seat reads
 * "Compact controls before the composer submit action" and it is a `list`, so
 * nothing has to be shadowed — unlike `conversation.input.model`, a `single`
 * seat the official picker holds at priority 0.
 *
 * ## How the draft is read and written
 *
 * `ui-conversation` publishes `uiSession.provide({ hooks: ["input"], props:
 * ["inputActions"] })`. The slot runtime materializes those per session, so this
 * component receives `useInput` (a selector hook over the draft state) and
 * `inputActions` (`setDraft`) as ordinary props — the same two props `InputBar`
 * itself takes. No DOM access, no textarea ref, no React internals.
 *
 * ## Failure is visible, never destructive
 *
 * The one rule this control must never break: the user's text survives. The
 * rewrite is only written on success, and every failure path leaves the draft
 * exactly as it was and shows why. Editing continues to work while a request is
 * in flight; the result overwrites whatever is there when it lands, which is
 * the behavior this plugin was asked for.
 *
 * ## In flight looks in flight
 *
 * While a request is running the glyph is swapped for a spinner. Disabling the
 * button alone is not enough feedback: a disabled icon that never changes reads
 * as a dead control, not a pending one, and a rewrite takes seconds.
 */
import { type ReactNode } from 'react';
/** The composer's draft state, as `useInput` selects from it. */
interface InputStateLike {
    draft?: string;
    phase?: string;
}
/** The write face `ui-conversation` publishes for the composer. */
interface InputActionsLike {
    setDraft?: (text: string) => void;
}
/** Props the seat composes for this control. */
export interface PromptEnhancerProps {
    /** The session whose model performs the rewrite. */
    sessionId?: string;
    /** Draft-state selector hook, published through the session scope. */
    useInput?: <T>(selector: (state: InputStateLike) => T) => T;
    /** Composer write face, published through the session scope. */
    inputActions?: InputActionsLike;
    /** Namespace-bound translator supplied by the seat. */
    t?: (key: string) => string;
}
/**
 * The enhancer button.
 * @param props - the composed slot props.
 * @returns the button, or null when the composer face is unavailable.
 */
export declare function PromptEnhancer({ sessionId, useInput, inputActions, t }: PromptEnhancerProps): ReactNode;
export {};
