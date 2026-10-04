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
import { type ReactNode } from 'react';
import type { AgentPresetStore } from './store.ts';
/** The session list slice this label reads to learn the session's preset. */
interface SessionListLike {
    byId: Record<string, {
        projectionValues?: {
            agentPreset?: unknown;
        };
    } | undefined>;
}
/** A boolean setting exposed by the client runtime as a snapshot source. */
interface BooleanSnapshotSource {
    getSnapshot(): boolean;
    subscribe(listener: () => void): () => void;
}
/** Props the header seat composes for this label. */
export interface AgentPresetLabelProps {
    /** The session this seat occurrence draws. */
    sessionId?: string;
    /** The client session list selector hook supplied by the seat. */
    useSessions?: <T>(selector: (state: SessionListLike) => T) => T;
    /** Namespace-bound translator supplied by the seat. */
    t?: (key: string) => string;
    /** The plugin's preset store (supplied through the seat's inject factory). */
    store?: AgentPresetStore;
    /**
     * The Developer-tools setting, when this deployment mounts it.
     *
     * The official plugin's header label is NOT gated on this setting (only its
     * hero chip is), so with Developer tools on it is already showing. This label
     * therefore stays out of the way then, and appears when the setting is off.
     * Omitted when the deployment has no such setting.
     */
    developerTools?: BooleanSnapshotSource;
}
/**
 * The label.
 * @param props - the composed slot props.
 * @returns the label, or null when no roster/preset is known.
 */
export declare function AgentPresetLabel({ sessionId, useSessions, t, store, developerTools, }: AgentPresetLabelProps): ReactNode;
export {};
