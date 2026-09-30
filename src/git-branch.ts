/**
 * Repository discovery, caching, and concurrency control for branch lookups.
 *
 * Three properties matter here, in order:
 *
 * 1. **Never throw.** Every failure — a missing directory, a permission error,
 *    a `.git` that is neither file nor directory, a race with `git checkout`
 *    rewriting HEAD — collapses to `undefined`, which the client renders as
 *    "no branch". The UI must never show an error placeholder for a plain
 *    non-repository folder.
 * 2. **Never spawn.** Branch detection is a couple of small file reads (see
 *    git-ref.ts); no subprocess, no PATH, no sandbox prompt.
 * 3. **Never stampede.** The sidebar asks about every workspace row on every
 *    DOM sync, so lookups are cached with a short TTL and de-duplicated per
 *    path, and the walk upward is depth-bounded.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { mergeRefNames, parseGitDirPointer, parseHead, parsePackedRefs, type GitHead, type GitRefEntry } from './git-ref.ts'

/**
 * How long a resolved answer stays fresh. Long enough that a streaming chat
 * turn's DOM churn costs zero filesystem work, short enough that a branch
 * switch shows up while the user is still looking at the row.
 */
export const CACHE_TTL_MS = 3_000

/**
 * How many parent directories to walk looking for `.git`.
 *
 * A session workspace is normally the repository root or one level inside it;
 * 12 covers deeply nested monorepo packages without letting a stray lookup in
 * `/` crawl the whole filesystem.
 */
export const MAX_WALK_DEPTH = 12

/** Upper bound on paths per request — a workspace list never approaches this. */
export const MAX_PATHS_PER_REQUEST = 64

/** How deep a nested branch name may go under `refs/heads/` before we stop. */
export const MAX_REF_DEPTH = 8

/** One cached answer, with the freshness stamp that retires it. */
interface CacheEntry {
  readonly head: GitHead | undefined
  readonly expiresAt: number
}

/** One cached branch list, with the freshness stamp that retires it. */
interface RefCacheEntry {
  readonly refs: GitRefEntry[]
  readonly expiresAt: number
}

/** Read a file, mapping every failure (ENOENT, EACCES, EISDIR…) to undefined. */
async function readIfPossible(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Resolve the real git directory of a repository whose `.git` entry sits at
 * `gitEntry`, or undefined when it is not a usable repository.
 *
 * `.git` is a DIRECTORY in an ordinary clone and a FILE containing
 * `gitdir: <path>` in a linked worktree or submodule. The pointer's path is
 * resolved against the directory holding the `.git` file, which is what git
 * itself does for the relative form it normally writes.
 * @param gitEntry - absolute path of the `.git` entry.
 * @returns the git directory, or undefined.
 */
async function gitDirOf(gitEntry: string): Promise<string | undefined> {
  try {
    const info = await stat(gitEntry)
    if (info.isDirectory()) return gitEntry
    if (!info.isFile()) return undefined
  } catch {
    return undefined
  }

  const pointer = await readIfPossible(gitEntry)
  if (pointer === undefined) return undefined
  const target = parseGitDirPointer(pointer)
  if (target === undefined) return undefined
  return isAbsolute(target) ? target : resolve(dirname(gitEntry), target)
}

/**
 * Read one repository's HEAD by walking up from `startPath`.
 *
 * The walk stops at the first `.git` entry found — the nearest repository wins,
 * which is what makes a nested repository inside a monorepo report its own
 * branch rather than the outer one.
 * @param startPath - an absolute directory to start from.
 * @returns the parsed head, or undefined when no repository is found.
 */
async function findHead(startPath: string): Promise<GitHead | undefined> {
  let current = startPath
  for (let depth = 0; depth <= MAX_WALK_DEPTH; depth += 1) {
    const gitDir = await gitDirOf(join(current, '.git'))
    if (gitDir !== undefined) {
      const headText = await readIfPossible(join(gitDir, 'HEAD'))
      if (headText === undefined) return undefined
      // A repository with an unreadable/unknown HEAD is reported as "no
      // branch" — deliberately NOT as "not a repository": the distinction
      // does not change what the UI draws, and callers should not act on it.
      return parseHead(headText)
    }
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
  return undefined
}

/**
 * Find the repository containing `startPath` and return its git directory.
 *
 * Shares the walk with {@link findHead}: the nearest `.git` entry wins, so a
 * nested repository reports its own branches.
 * @param startPath - an absolute directory to start from.
 * @returns the git directory, or undefined when no repository is found.
 */
async function findGitDir(startPath: string): Promise<string | undefined> {
  let current = startPath
  for (let depth = 0; depth <= MAX_WALK_DEPTH; depth += 1) {
    const gitDir = await gitDirOf(join(current, '.git'))
    if (gitDir !== undefined) return gitDir
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
  return undefined
}

/**
 * Read a directory's entry names, mapping every failure to an empty list.
 * @param dir - the directory to list.
 * @returns the entry names (files and directories alike).
 */
async function readDirNames(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/**
 * List the local branches of the repository containing `path`.
 *
 * Branches live in two places, and a repository may use either or both: loose
 * files under `.git/refs/heads/` (possibly nested, since a branch name may
 * contain slashes) and the compacted `.git/packed-refs`. Both are read; a
 * freshly created branch is loose, and an old clone's branches are packed.
 *
 * Returns an empty list for anything that is not a repository or cannot be read
 * — the caller renders no menu rather than an error.
 * @param path - an absolute directory inside the repository.
 * @returns the sorted branch entries, empty when there are none to show.
 */
async function findRefs(path: string): Promise<GitRefEntry[]> {
  const gitDir = await findGitDir(path)
  if (gitDir === undefined) return []

  const headText = await readIfPossible(join(gitDir, 'HEAD'))
  const head = headText === undefined ? undefined : parseHead(headText)
  const current = head !== undefined && !head.detached ? head.branch : undefined

  // Loose refs, walking the refs/heads tree (branch names may be nested).
  const loose: string[] = []
  const walk = async (dir: string, prefix: string, depth: number): Promise<void> => {
    // A branch name deeper than this is pathological; stop rather than recurse
    // without bound on a hand-corrupted refs tree.
    if (depth > MAX_REF_DEPTH) return
    for (const entry of await readDirNames(dir)) {
      const full = join(dir, entry)
      const name = prefix === '' ? entry : `${prefix}/${entry}`
      try {
        const info = await stat(full)
        if (info.isDirectory()) await walk(full, name, depth + 1)
        else if (info.isFile()) loose.push(name)
      } catch {
        // A ref that vanished mid-walk is simply not listed.
      }
    }
  }
  await walk(join(gitDir, 'refs', 'heads'), '', 0)

  const packedText = await readIfPossible(join(gitDir, 'packed-refs'))
  const packed = packedText === undefined ? [] : parsePackedRefs(packedText)

  return mergeRefNames(loose, packed, current)
}

/**
 * The branch cache: TTL'd answers plus in-flight de-duplication.
 *
 * One instance is created per plugin activation (never a module-level
 * singleton, matching the DSH store rule) and disposed with the fiber.
 */
export class BranchCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<GitHead | undefined>>()
  private readonly refEntries = new Map<string, RefCacheEntry>()
  private readonly refInflight = new Map<string, Promise<GitRefEntry[]>>()
  private disposed = false

  /** @param ttlMs - freshness window; overridable for tests. */
  constructor(private readonly ttlMs: number = CACHE_TTL_MS) {}

  /**
   * The branch list of the repository containing `path`, cached and
   * de-duplicated exactly like {@link headOf}.
   * @param path - an absolute directory path.
   * @returns the sorted branch entries, empty when there is nothing to show.
   */
  async refsOf(path: string): Promise<GitRefEntry[]> {
    if (this.disposed) return []

    const now = Date.now()
    const cached = this.refEntries.get(path)
    if (cached !== undefined && cached.expiresAt > now) return cached.refs

    const pending = this.refInflight.get(path)
    if (pending !== undefined) return pending

    const task = findRefs(path)
      .catch(() => [])
      .then((refs) => {
        if (!this.disposed) this.refEntries.set(path, { refs, expiresAt: Date.now() + this.ttlMs })
        return refs
      })
      .finally(() => {
        this.refInflight.delete(path)
      })

    this.refInflight.set(path, task)
    return task
  }

  /**
   * The head of the repository containing `path`, cached and de-duplicated.
   *
   * Concurrent calls for the same path share one filesystem walk. A failure is
   * cached too (as "no branch") for the TTL, so a directory that is not a
   * repository does not cost a walk on every sync.
   * @param path - an absolute directory path.
   * @returns the head, or undefined when there is none to show.
   */
  async headOf(path: string): Promise<GitHead | undefined> {
    if (this.disposed) return undefined

    const now = Date.now()
    const cached = this.entries.get(path)
    if (cached !== undefined && cached.expiresAt > now) return cached.head

    const pending = this.inflight.get(path)
    if (pending !== undefined) return pending

    const task = findHead(path)
      .catch(() => undefined)
      .then((head) => {
        // A dispose that lands mid-flight must not repopulate the cache.
        if (!this.disposed) this.entries.set(path, { head, expiresAt: Date.now() + this.ttlMs })
        return head
      })
      .finally(() => {
        this.inflight.delete(path)
      })

    this.inflight.set(path, task)
    return task
  }

  /**
   * Resolve many paths in one call, preserving request order.
   *
   * Every path resolves independently: one unreadable directory never fails
   * its siblings.
   * @param paths - absolute directory paths (already bounded by the caller).
   * @returns one entry per path, in the same order.
   */
  async headsOf(paths: readonly string[]): Promise<{ path: string; head: GitHead | undefined }[]> {
    const heads = await Promise.all(paths.map(async (path) => ({ path, head: await this.headOf(path) })))
    return heads
  }

  /**
   * Drop the cached answers for one path (or every path), so the next lookup
   * re-reads HEAD / refs. Used after a successful checkout.
   * @param path - absolute path to invalidate; omit to clear the whole cache.
   */
  invalidate(path?: string): void {
    if (path === undefined) {
      this.entries.clear()
      this.refEntries.clear()
      return
    }
    this.entries.delete(path)
    this.refEntries.delete(path)
  }

  /** Drop every cached answer, keeping the instance usable (settings change). */
  clear(): void {
    this.invalidate()
  }

  /** Release the cache; later lookups answer undefined. */
  dispose(): void {
    this.disposed = true
    this.entries.clear()
    this.inflight.clear()
    this.refEntries.clear()
    this.refInflight.clear()
  }
}
