/**
 * The client-side branch store: one activation-scoped cache of
 * `path -> branch`, plus the request scheduling that keeps the UI from
 * stampeding the host route.
 *
 * Design notes:
 *
 * - **Snapshot + subscribe, not React state.** The store is read through
 *   `useSyncExternalStore`, so a branch that arrives while a component is
 *   mounted re-renders it without any prop threading, and a lookup that never
 *   resolves simply leaves the snapshot at "unknown" — which renders as
 *   nothing.
 * - **Batched and coalesced.** Every `request(paths)` call folds its paths into
 *   one pending set and schedules a single microtask-later flush, so a row sync
 *   that discovers ten workspaces issues one request, not ten.
 * - **Backoff on failure.** A failed batch does not retry in a tight loop: the
 *   delay grows 3s → 10s → 30s and stays there. The UI shows nothing
 *   throughout, which is the intended behavior for "host route unavailable".
 * - **No negative-result caching beyond the host's own TTL.** The host already
 *   caches "not a repository" for a few seconds; the client only remembers what
 *   it has successfully resolved, so a fresh page load always re-asks.
 */
import { type BranchAnswer } from './api.ts';
/** The observable snapshot: a frozen map from absolute path to answer. */
export type BranchSnapshot = Readonly<Record<string, BranchAnswer>>;
/** Retry delays after consecutive failures, in milliseconds (last value repeats). */
export declare const RETRY_DELAYS_MS: readonly [3000, 10000, 30000];
/**
 * One activation's branch store.
 *
 * Created once in the client `apply()` and closed over by every registration —
 * never a module-level singleton, matching the DSH store rule (a module
 * singleton would survive HMR and leak answers across activations).
 */
export declare class BranchStore {
    private snapshot;
    private readonly listeners;
    private readonly pending;
    private flushScheduled;
    private failures;
    private retryTimer;
    private disposed;
    /**
     * The current snapshot. Reference-stable between changes, as
     * `useSyncExternalStore` requires.
     * @returns the path → answer map.
     */
    getSnapshot: () => BranchSnapshot;
    /**
     * Subscribe to snapshot changes.
     * @param listener - invalidation callback.
     * @returns the unsubscribe callback.
     */
    subscribe: (listener: () => void) => (() => void);
    /**
     * The branch of one path, or undefined while unknown / not a repository.
     * @param path - the absolute workspace path.
     * @returns the answer, or undefined.
     */
    branchOf(path: string): BranchAnswer | undefined;
    /**
     * Ask about a set of paths, skipping ones already answered.
     *
     * Safe to call on every render/sync: answered paths cost a map lookup, and
     * unanswered ones are coalesced into the next flush.
     * @param paths - absolute workspace paths.
     */
    request(paths: readonly string[]): void;
    /**
     * Forget everything and re-arm, so the next request re-resolves every path
     * (used when a workspace list changes and rows may have been re-pointed).
     */
    invalidate(): void;
    /**
     * Publish a known answer immediately (after a successful checkout).
     * @param path - absolute workspace path.
     * @param answer - the branch now checked out.
     */
    publish(path: string, answer: BranchAnswer): void;
    /** Stop all work; later calls are no-ops. */
    dispose(): void;
    /** Coalesce this tick's requests into one flush. */
    private scheduleFlush;
    /** Issue one batch request for everything pending. */
    private flush;
    /** Notify subscribers. */
    private emit;
}
