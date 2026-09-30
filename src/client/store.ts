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
import { fetchBranches, type BranchAnswer } from './api.ts'

/** The observable snapshot: a frozen map from absolute path to answer. */
export type BranchSnapshot = Readonly<Record<string, BranchAnswer>>

/** Retry delays after consecutive failures, in milliseconds (last value repeats). */
export const RETRY_DELAYS_MS = [3_000, 10_000, 30_000] as const

/** An empty snapshot, shared so an empty store does not allocate per read. */
const EMPTY: BranchSnapshot = Object.freeze({})

/**
 * One activation's branch store.
 *
 * Created once in the client `apply()` and closed over by every registration —
 * never a module-level singleton, matching the DSH store rule (a module
 * singleton would survive HMR and leak answers across activations).
 */
export class BranchStore {
  private snapshot: BranchSnapshot = EMPTY
  private readonly listeners = new Set<() => void>()
  private readonly pending = new Set<string>()
  private flushScheduled = false
  private failures = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  /**
   * The current snapshot. Reference-stable between changes, as
   * `useSyncExternalStore` requires.
   * @returns the path → answer map.
   */
  getSnapshot = (): BranchSnapshot => this.snapshot

  /**
   * Subscribe to snapshot changes.
   * @param listener - invalidation callback.
   * @returns the unsubscribe callback.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * The branch of one path, or undefined while unknown / not a repository.
   * @param path - the absolute workspace path.
   * @returns the answer, or undefined.
   */
  branchOf(path: string): BranchAnswer | undefined {
    return this.snapshot[path]
  }

  /**
   * Ask about a set of paths, skipping ones already answered.
   *
   * Safe to call on every render/sync: answered paths cost a map lookup, and
   * unanswered ones are coalesced into the next flush.
   * @param paths - absolute workspace paths.
   */
  request(paths: readonly string[]): void {
    if (this.disposed) return
    let added = false
    for (const path of paths) {
      if (path === '' || this.snapshot[path] !== undefined || this.pending.has(path)) continue
      this.pending.add(path)
      added = true
    }
    if (!added) return
    // A retry timer already owns the next flush; do not schedule a second one.
    if (this.retryTimer !== undefined) return
    this.scheduleFlush()
  }

  /**
   * Forget everything and re-arm, so the next request re-resolves every path
   * (used when a workspace list changes and rows may have been re-pointed).
   */
  invalidate(): void {
    if (this.disposed) return
    this.snapshot = EMPTY
    this.pending.clear()
    this.emit()
  }

  /**
   * Publish a known answer immediately (after a successful checkout).
   * @param path - absolute workspace path.
   * @param answer - the branch now checked out.
   */
  publish(path: string, answer: BranchAnswer): void {
    if (this.disposed || path === '' || answer.branch === null) return
    this.snapshot = Object.freeze({ ...this.snapshot, [path]: answer })
    this.emit()
  }

  /** Stop all work; later calls are no-ops. */
  dispose(): void {
    this.disposed = true
    this.pending.clear()
    this.listeners.clear()
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
  }

  /** Coalesce this tick's requests into one flush. */
  private scheduleFlush(): void {
    if (this.flushScheduled || this.disposed) return
    this.flushScheduled = true
    // A microtask (not a timer) so the flush lands after the current sync pass
    // has finished discovering rows, and before the browser paints.
    void Promise.resolve().then(() => {
      this.flushScheduled = false
      void this.flush()
    })
  }

  /** Issue one batch request for everything pending. */
  private async flush(): Promise<void> {
    if (this.disposed || this.pending.size === 0) return
    const paths = [...this.pending]
    this.pending.clear()
    try {
      const { branches } = await fetchBranches(paths)
      if (this.disposed) return
      this.failures = 0
      let changed = false
      const next: Record<string, BranchAnswer> = { ...this.snapshot }
      for (const path of paths) {
        const answer = branches[path] ?? { branch: null, detached: false }
        // Only publish paths that HAVE a branch. A null answer stays out of the
        // snapshot entirely, so the row renders nothing and — because
        // `request()` skips paths already in the snapshot — the path is
        // re-asked on the next sync, which is exactly what makes a later
        // `git init` or branch switch appear without a reload.
        if (answer.branch === null) continue
        next[path] = answer
        changed = true
      }
      if (changed) {
        this.snapshot = Object.freeze(next)
        this.emit()
      }
    } catch {
      if (this.disposed) return
      // Backoff: the UI keeps showing whatever it had (usually nothing) and the
      // pending paths are retried once the delay elapses.
      const delay = RETRY_DELAYS_MS[Math.min(this.failures, RETRY_DELAYS_MS.length - 1)] ?? 30_000
      this.failures += 1
      for (const path of paths) this.pending.add(path)
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined
        this.scheduleFlush()
      }, delay)
    }
  }

  /** Notify subscribers. */
  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // A broken subscriber must not stop the others.
      }
    }
  }
}
