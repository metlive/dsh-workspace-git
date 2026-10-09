import { type GitHead, type GitRefEntry } from './git-ref.ts';
/**
 * How long a resolved answer stays fresh. Long enough that a streaming chat
 * turn's DOM churn costs zero filesystem work, short enough that a branch
 * switch shows up while the user is still looking at the row.
 */
export declare const CACHE_TTL_MS = 3000;
/**
 * How many parent directories to walk looking for `.git`.
 *
 * A session workspace is normally the repository root or one level inside it;
 * 12 covers deeply nested monorepo packages without letting a stray lookup in
 * `/` crawl the whole filesystem.
 */
export declare const MAX_WALK_DEPTH = 12;
/** Upper bound on paths per request — a workspace list never approaches this. */
export declare const MAX_PATHS_PER_REQUEST = 64;
/** How deep a nested branch name may go under `refs/heads/` before we stop. */
export declare const MAX_REF_DEPTH = 8;
/**
 * The branch cache: TTL'd answers plus in-flight de-duplication.
 *
 * One instance is created per plugin activation (never a module-level
 * singleton, matching the DSH store rule) and disposed with the fiber.
 */
export declare class BranchCache {
    private readonly ttlMs;
    private readonly entries;
    private readonly inflight;
    private readonly refEntries;
    private readonly refInflight;
    /**
     * Per-path generation, bumped by {@link invalidate}.
     *
     * Deleting a cache entry is not enough to make an invalidation stick: a walk
     * already in flight holds no reference to the map, so its `.then` would
     * re-insert the PRE-checkout answer under a fresh TTL. The window is real —
     * `resolveCheckout` invalidates right after `git switch` returns, while the
     * sidebar's `branches` poll for the same path may be mid-walk. The stale head
     * would then be served for the whole TTL, showing the OLD branch immediately
     * after a successful switch.
     *
     * A lookup captures the generation it started under and only publishes when
     * it is still current.
     */
    private readonly epoch;
    private disposed;
    /** @param ttlMs - freshness window; overridable for tests. */
    constructor(ttlMs?: number);
    /** The current generation for one path (0 when never invalidated). */
    private epochOf;
    /**
     * The branch list of the repository containing `path`, cached and
     * de-duplicated exactly like {@link headOf}.
     * @param path - an absolute directory path.
     * @returns the sorted branch entries, empty when there is nothing to show.
     */
    refsOf(path: string): Promise<GitRefEntry[]>;
    /**
     * The head of the repository containing `path`, cached and de-duplicated.
     *
     * Concurrent calls for the same path share one filesystem walk. A failure is
     * cached too (as "no branch") for the TTL, so a directory that is not a
     * repository does not cost a walk on every sync.
     * @param path - an absolute directory path.
     * @returns the head, or undefined when there is none to show.
     */
    headOf(path: string): Promise<GitHead | undefined>;
    /**
     * Resolve many paths in one call, preserving request order.
     *
     * Every path resolves independently: one unreadable directory never fails
     * its siblings.
     * @param paths - absolute directory paths (already bounded by the caller).
     * @returns one entry per path, in the same order.
     */
    headsOf(paths: readonly string[]): Promise<{
        path: string;
        head: GitHead | undefined;
    }[]>;
    /**
     * Drop the cached answers for one path (or every path), so the next lookup
     * re-reads HEAD / refs. Used after a successful checkout.
     *
     * Bumping the epoch is what makes this stick: it disowns any walk already in
     * flight for the path, which would otherwise re-publish the pre-checkout
     * answer (see the `epoch` field). `inflight` is deliberately NOT cleared —
     * the shared promise is still a valid de-duplication handle for callers
     * already awaiting it, and it removes itself in its own `finally`.
     * @param path - absolute path to invalidate; omit to clear the whole cache.
     */
    invalidate(path?: string): void;
    /** Drop every cached answer, keeping the instance usable (settings change). */
    clear(): void;
    /** Release the cache; later lookups answer undefined. */
    dispose(): void;
}
