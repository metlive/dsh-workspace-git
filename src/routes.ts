/**
 * The plugin's fenced host routes under `POST /workspace-git/api/*`.
 *
 * - `branches` — batch current-branch lookup (file-based, no git binary)
 * - `refs` — local + remote branch list for the composer menu
 * - `graph` — commit-graph page via `git log` (needs a git binary)
 * - `commit` — one commit's message + changed files (detail panel)
 * - `status` — the work tree's uncommitted state (pre-switch guard)
 * - `checkout` — switch the work tree to a local or remote-tracking branch
 * - `create-branch` — create + check out a new branch (`git switch -c`)
 * - `enhance-prompt` — rewrite a composer draft through the session's own model
 */
import { isAbsolute } from 'node:path'
import { MAX_PATHS_PER_REQUEST, type BranchCache } from './git-branch.ts'
import { checkoutBranch, createBranch, workTreeStatus, type WorkTreeStatus } from './git-checkout.ts'
import { fetchCommitDetail, type GitCommitDetail } from './git-commit-detail.ts'
import { DEFAULT_GRAPH_PAGE_SIZE, MAX_GRAPH_PAGE_SIZE, fetchCommitGraph, fetchRefTips, type GitGraphSnapshot } from './git-graph.ts'
import type { GitRefKind } from './git-ref.ts'
import { enhancePrompt } from './prompt-enhance.ts'
import type { Context, PluginHttpRequest, PluginHttpResponse } from './context-types.ts'
import { WorkspaceGitError, readJsonBody, writeError, writeOk } from './wire.ts'

/** Route path prefix; the API method is the final segment. */
export const API_PREFIX = '/workspace-git/api'

/** One branch answer as the wire carries it. */
export interface BranchAnswer {
  /** The branch name, a short id when detached, or null when there is none. */
  branch: string | null
  /** Whether HEAD is detached (the client renders those differently). */
  detached: boolean
}

/** The `branches` method's result. */
export interface BranchesResult {
  branches: Record<string, BranchAnswer>
}

/** One branch row as the menu consumes it. */
export interface RefAnswer {
  /** The short branch name (`main`) or remote-tracking name (`origin/main`). */
  name: string
  /** Whether HEAD currently points at it (only ever true for local refs). */
  current: boolean
  /** Local vs remote-tracking — drives menu grouping. */
  kind: GitRefKind
}

/** The `refs` method's result: local + remote branches of one repository. */
export interface RefsResult {
  /** Whether HEAD is detached (the list is still shown; no row is current). */
  detached: boolean
  /** Recent-sorted refs (locals first, then remotes). */
  refs: RefAnswer[]
}

/**
 * Narrow an unknown payload to a bounded list of absolute paths.
 * @param payload - the parsed request body.
 * @returns the validated paths.
 */
export function parseBranchesRequest(payload: unknown): string[] {
  const record = payload as { paths?: unknown } | null
  const paths = record?.paths
  if (!Array.isArray(paths)) {
    throw new WorkspaceGitError('bad-request', 'paths must be an array')
  }
  if (paths.length > MAX_PATHS_PER_REQUEST) {
    throw new WorkspaceGitError('bad-request', `paths must contain at most ${MAX_PATHS_PER_REQUEST} entries`)
  }
  const validated: string[] = []
  for (const entry of paths) {
    if (typeof entry !== 'string' || entry === '') {
      throw new WorkspaceGitError('bad-request', 'every path must be a non-empty string')
    }
    if (!isAbsolute(entry)) {
      throw new WorkspaceGitError('bad-request', `path "${entry}" is not absolute`)
    }
    if (!validated.includes(entry)) validated.push(entry)
  }
  return validated
}

/**
 * Resolve the branch answers for one payload.
 * @param cache - the activation-scoped branch cache.
 * @param payload - the parsed request body.
 * @returns the per-path answer map.
 */
export async function resolveBranches(cache: BranchCache, payload: unknown): Promise<BranchesResult> {
  const paths = parseBranchesRequest(payload)
  const heads = await cache.headsOf(paths)
  const branches: Record<string, BranchAnswer> = {}
  for (const { path, head } of heads) {
    branches[path] = head === undefined
      ? { branch: null, detached: false }
      : { branch: head.branch, detached: head.detached }
  }
  return { branches }
}

/**
 * Narrow an unknown payload to the single absolute path the ref list is for.
 * @param payload - the parsed request body.
 * @returns the validated path.
 */
export function parseRefsRequest(payload: unknown): string {
  const record = payload as { path?: unknown } | null
  const path = record?.path
  if (typeof path !== 'string' || path === '') {
    throw new WorkspaceGitError('bad-request', 'path must be a non-empty string')
  }
  if (!isAbsolute(path)) {
    throw new WorkspaceGitError('bad-request', `path "${path}" is not absolute`)
  }
  return path
}

/**
 * Resolve the branch list of one repository.
 * @param cache - the activation-scoped branch cache.
 * @param payload - the parsed request body.
 * @returns the branch list (empty for a directory that is not a repository).
 */
export async function resolveRefs(cache: BranchCache, payload: unknown): Promise<RefsResult> {
  const path = parseRefsRequest(payload)
  const refs = await cache.refsOf(path)
  return {
    detached: refs.length > 0 && !refs.some(entry => entry.current),
    refs: refs.map(entry => ({ name: entry.name, current: entry.current, kind: entry.kind })),
  }
}

/**
 * Narrow a graph request: absolute path plus optional pagination.
 * @param payload - the parsed request body.
 * @returns path / maxCount / skip.
 */
export function parseGraphRequest(payload: unknown): { path: string; maxCount: number; skip: number } {
  const record = payload as { path?: unknown; maxCount?: unknown; skip?: unknown } | null
  const path = parseRefsRequest(record)
  let maxCount = DEFAULT_GRAPH_PAGE_SIZE
  if (record?.maxCount !== undefined) {
    if (typeof record.maxCount !== 'number' || !Number.isFinite(record.maxCount)) {
      throw new WorkspaceGitError('bad-request', 'maxCount must be a number')
    }
    maxCount = Math.min(MAX_GRAPH_PAGE_SIZE, Math.max(1, Math.floor(record.maxCount)))
  }
  let skip = 0
  if (record?.skip !== undefined) {
    if (typeof record.skip !== 'number' || !Number.isFinite(record.skip)) {
      throw new WorkspaceGitError('bad-request', 'skip must be a number')
    }
    skip = Math.max(0, Math.floor(record.skip))
  }
  return { path, maxCount, skip }
}

/**
 * Resolve one page of the commit graph.
 * @param payload - the parsed request body.
 * @returns the graph page.
 */
export async function resolveGraph(payload: unknown): Promise<GitGraphSnapshot> {
  const { path, maxCount, skip } = parseGraphRequest(payload)
  return fetchCommitGraph(path, maxCount, skip)
}

/**
 * Resolve every branch/tag tip of one repository.
 *
 * The graph is paginated and `--decorate` only names a ref on the commit it
 * points at, so the client cannot learn a branch's tip from the commits alone
 * once that tip falls on an unloaded page. Filtering by branch needs the tip, so
 * this is its own method rather than an extra field on the page.
 * @param payload - the parsed request body.
 * @returns short ref name -> object id.
 */
export async function resolveTips(payload: unknown): Promise<{ tips: Record<string, string>; branches: Record<string, string> }> {
  const path = parseRefsRequest(payload)
  return await fetchRefTips(path)
}

/**
 * Narrow a checkout request: absolute path + branch name + optional kind.
 * @param payload - the parsed request body.
 * @returns path, branch, and kind (defaults to local).
 */
export function parseCheckoutRequest(payload: unknown): {
  path: string
  branch: string
  kind: GitRefKind
} {
  const record = payload as { path?: unknown; branch?: unknown; kind?: unknown } | null
  const path = parseRefsRequest(record)
  const branch = record?.branch
  if (typeof branch !== 'string' || branch === '') {
    throw new WorkspaceGitError('bad-request', 'branch must be a non-empty string')
  }
  const kind: GitRefKind = record?.kind === 'remote' ? 'remote' : 'local'
  return { path, branch, kind }
}

/**
 * Switch the work tree to the requested branch and bust the branch cache.
 * @param cache - the activation-scoped branch cache.
 * @param payload - the parsed request body.
 * @returns the branch now checked out.
 */
export async function resolveCheckout(
  cache: BranchCache,
  payload: unknown,
): Promise<{ branch: string }> {
  const { path, branch, kind } = parseCheckoutRequest(payload)
  const result = await checkoutBranch(path, branch, kind)
  cache.invalidate(path)
  return result
}

/**
 * Create and check out a new branch, then bust the branch cache.
 * @param cache - the activation-scoped branch cache.
 * @param payload - the parsed request body.
 * @returns the branch now checked out.
 */
export async function resolveCreateBranch(
  cache: BranchCache,
  payload: unknown,
): Promise<{ branch: string }> {
  const { path, branch } = parseCheckoutRequest(payload)
  const result = await createBranch(path, branch)
  cache.invalidate(path)
  return result
}

/**
 * Read the work tree's uncommitted state for the pre-switch guard.
 *
 * A READ, deliberately separate from `checkout`: the client asks first, shows
 * the user what is dirty, and only then decides whether to switch. Folding the
 * check into the switch would make the guard unobservable — the dialog needs
 * the list BEFORE anything is attempted.
 * @param payload - the parsed request body.
 * @returns the status (an empty `changes` array when the tree is clean).
 */
export async function resolveStatus(payload: unknown): Promise<WorkTreeStatus> {
  const path = parseRefsRequest(payload)
  return workTreeStatus(path)
}

/**
 * Narrow a commit-detail request: absolute path + full object id.
 * @param payload - the parsed request body.
 */
export function parseCommitRequest(payload: unknown): { path: string; hash: string } {
  const record = payload as { path?: unknown; hash?: unknown } | null
  const path = parseRefsRequest(record)
  const hash = record?.hash
  if (typeof hash !== 'string' || hash === '') {
    throw new WorkspaceGitError('bad-request', 'hash must be a non-empty string')
  }
  return { path, hash }
}

/**
 * Resolve one commit's detail payload for the graph side panel.
 * @param payload - the parsed request body.
 */
export async function resolveCommit(payload: unknown): Promise<GitCommitDetail> {
  const { path, hash } = parseCommitRequest(payload)
  return fetchCommitDetail(path, hash)
}

/**
 * Build the route handler.
 * @param cache - the activation-scoped branch cache.
 * @param fence - browser-trust predicate.
 * @returns the route handler.
 */
export function createApiHandler(
  cache: BranchCache,
  fence: (req: PluginHttpRequest) => boolean,
  ctx: Context,
): (req: PluginHttpRequest, res: PluginHttpResponse) => Promise<void> {
  return async (req, res): Promise<void> => {
    if (!fence(req)) {
      writeError(res, new WorkspaceGitError('forbidden', 'forbidden', 403))
      return
    }
    if (req.method !== 'POST') {
      writeError(res, new WorkspaceGitError('method-error', 'method not allowed', 405))
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
    const method = pathname.startsWith(`${API_PREFIX}/`) ? pathname.slice(API_PREFIX.length + 1) : undefined
    if (method === undefined || method.includes('/')) {
      writeError(res, new WorkspaceGitError('not-found', 'unknown workspace-git API method'))
      return
    }
    try {
      const payload = await readJsonBody(req)
      if (method === 'branches') {
        writeOk(res, await resolveBranches(cache, payload))
        return
      }
      if (method === 'refs') {
        writeOk(res, await resolveRefs(cache, payload))
        return
      }
      if (method === 'graph') {
        writeOk(res, await resolveGraph(payload))
        return
      }
      if (method === 'tips') {
        writeOk(res, await resolveTips(payload))
        return
      }
      if (method === 'commit') {
        writeOk(res, await resolveCommit(payload))
        return
      }
      if (method === 'status') {
        writeOk(res, await resolveStatus(payload))
        return
      }
      if (method === 'checkout') {
        writeOk(res, await resolveCheckout(cache, payload))
        return
      }
      if (method === 'create-branch') {
        writeOk(res, await resolveCreateBranch(cache, payload))
        return
      }
      if (method === 'enhance-prompt') {
        writeOk(res, await enhancePrompt(ctx, payload))
        return
      }
      throw new WorkspaceGitError('not-found', `unknown workspace-git API method "${method}"`)
    } catch (error) {
      writeError(res, error)
    }
  }
}
