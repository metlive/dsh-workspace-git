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
import { type ReactNode } from 'react';
import type { AgentPresetStore } from './store.ts';
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
        projectionValues?: {
            agentPreset?: unknown;
        };
        /** Present and `true` only while no message has been sent in this session. */
        blank?: unknown;
    } | undefined>;
}
/** Props the hero seat composes for this chip. */
export interface AgentPresetChipProps {
    /**
     * The session this seat occurrence draws. `undefined` on the new-session
     * screen before a session exists.
     */
    sessionId?: string;
    /** The client session list selector hook supplied by the seat. */
    useSessions?: <T>(selector: (state: SessionListLike) => T) => T;
    /** Namespace-bound translator supplied by the seat. */
    t?: (key: string) => string;
    /** The plugin's preset store (supplied through the seat's inject factory). */
    store?: AgentPresetStore;
}
/**
 * The chip.
 * @param props - the composed slot props.
 * @returns the chip and its menu, or null when there is nothing to show.
 */
export declare function AgentPresetChip({ sessionId, useSessions, t, store, }: AgentPresetChipProps): ReactNode;
export {};
