/**
 * Host-side branch checkout: runs `git switch` in the work tree.
 *
 * Branch detection stays file-based elsewhere; switching is the one write path
 * and needs a git binary. The branch name is validated before it reaches the
 * argv, so a crafted menu row cannot pass flags or pathspecs.
 *
 * Remote-tracking refs (`origin/feature`) use `git switch --track` so a local
 * branch is created (or reused) rather than leaving HEAD detached.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { findWorkTree } from './git-graph.ts'
import type { GitRefKind } from './git-ref.ts'
import { WorkspaceGitError } from './wire.ts'

const execFileAsync = promisify(execFile)

/** Conservative allowlist for local / remote-tracking branch names. */
const SAFE_BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._][A-Za-z0-9._/-]{0,254}$/

/**
 * Reject branch names that could be mistaken for git options or pathspecs.
 * @param branch - the short local or remote-tracking name from the client.
 * @throws WorkspaceGitError when the name is not safe to pass to git.
 */
export function assertSafeBranchName(branch: string): void {
  if (typeof branch !== 'string' || branch === '') {
    throw new WorkspaceGitError('bad-request', 'branch must be a non-empty string')
  }
  if (!SAFE_BRANCH.test(branch)) {
    throw new WorkspaceGitError('bad-request', `branch name "${branch}" is not allowed`)
  }
}

/**
 * Run one `git` command in the work tree, mapping a non-zero exit to a
 * `bad-request` error that carries git's stderr (so the client can show it).
 * @param workTree - absolute work-tree root.
 * @param args - the argv after `git` (branch names are validated upstream).
 * @param fallback - the message when git prints no stderr.
 * @returns stdout (trimmed), when the command succeeds.
 */
async function runGit(workTree: string, args: readonly string[], fallback: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd: workTree,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1 * 1024 * 1024,
    })
    return typeof stdout === 'string' ? stdout.trim() : ''
  } catch (error) {
    const stderr = error !== null && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr ?? '')
      : ''
    const message = (stderr.trim() || (error instanceof Error ? error.message : String(error))).trim()
    throw new WorkspaceGitError('bad-request', message || fallback, 400)
  }
}

/**
 * Like {@link runGit}, but WITHOUT trimming the output.
 *
 * `--porcelain=v1 -z` output is position-sensitive: each record starts with a
 * two-character status whose FIRST character is a space for worktree-only
 * changes (`" D"` = deleted in the worktree, `" M"` = modified). Trimming would
 * strip that leading space and shift every subsequent `slice(3)` by one — which
 * silently renamed `delete-me.txt` to `elete-me.txt`. Trailing whitespace in a
 * path is equally significant.
 *
 * @param workTree - absolute work-tree root.
 * @param args - the argv after `git`.
 * @param fallback - the message when git prints no stderr.
 * @returns stdout, verbatim.
 */
async function runGitRaw(workTree: string, args: readonly string[], fallback: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd: workTree,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    })
    return typeof stdout === 'string' ? stdout : ''
  } catch (error) {
    const stderr = error !== null && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr ?? '')
      : ''
    const message = (stderr.trim() || (error instanceof Error ? error.message : String(error))).trim()
    throw new WorkspaceGitError('bad-request', message || fallback, 400)
  }
}

/**
 * Local short name implied by a remote-tracking ref (`origin/feature/x` →
 * `feature/x`). Returns undefined when the name has no remote prefix.
 * @param remoteRef - e.g. `origin/main`.
 */
export function localNameFromRemote(remoteRef: string): string | undefined {
  const slash = remoteRef.indexOf('/')
  if (slash <= 0 || slash === remoteRef.length - 1) return undefined
  return remoteRef.slice(slash + 1)
}

/**
 * Whether a local branch ref exists in the work tree.
 * @param workTree - absolute work-tree root.
 * @param local - short local branch name.
 */
async function localBranchExists(workTree: string, local: string): Promise<boolean> {
  try {
    await runGit(workTree, ['show-ref', '--verify', '--quiet', `refs/heads/${local}`], '')
    return true
  } catch {
    return false
  }
}

/**
 * Checkout `branch` in the repository containing `path`.
 *
 * When `kind` is `remote`, uses `git switch --track` (or switches to an
 * existing local branch of the same short name) so HEAD stays on a local
 * branch. Otherwise runs a plain `git switch`.
 * @param path - absolute workspace path.
 * @param branch - short local name, or `remote/branch` for tracking refs.
 * @param kind - optional explicit kind from the menu row.
 * @returns the local branch that is now checked out.
 * @throws WorkspaceGitError when the path is not a repo or git rejects the switch.
 */
export async function checkoutBranch(
  path: string,
  branch: string,
  kind: GitRefKind = 'local',
): Promise<{ branch: string }> {
  assertSafeBranchName(branch)
  const workTree = await findWorkTree(path)
  if (workTree === undefined) {
    throw new WorkspaceGitError('bad-request', 'not a git repository', 400)
  }

  if (kind === 'remote') {
    const local = localNameFromRemote(branch)
    if (local === undefined) {
      throw new WorkspaceGitError('bad-request', `remote branch "${branch}" is not allowed`, 400)
    }
    assertSafeBranchName(local)
    if (await localBranchExists(workTree, local)) {
      await runGit(workTree, ['switch', '--', local], `failed to switch to "${local}"`)
      return { branch: local }
    }
    await runGit(
      workTree,
      ['switch', '--track', '--', branch],
      `failed to switch to tracking branch "${branch}"`,
    )
    const current = await runGit(workTree, ['branch', '--show-current'], 'failed to read current branch')
    return { branch: current || local }
  }

  await runGit(workTree, ['switch', '--', branch], `failed to switch to "${branch}"`)
  return { branch }
}

/**
 * Create `branch` at the current HEAD and check it out (`git switch -c`).
 * @param path - absolute workspace path.
 * @param branch - short local branch name for the new branch.
 * @returns the branch that is now checked out.
 * @throws WorkspaceGitError when the path is not a repo, the name is unsafe,
 *   or git rejects the create (e.g. the branch already exists).
 */
export async function createBranch(path: string, branch: string): Promise<{ branch: string }> {
  assertSafeBranchName(branch)
  const workTree = await findWorkTree(path)
  if (workTree === undefined) {
    throw new WorkspaceGitError('bad-request', 'not a git repository', 400)
  }
  await runGit(workTree, ['switch', '-c', branch], `failed to create "${branch}"`)
  return { branch }
}

/** One uncommitted entry, as the switch guard reports it. */
export interface WorkTreeChange {
  /** Path relative to the work-tree root, POSIX-separated. */
  path: string
  /**
   * Two-letter porcelain status (`M `, ` M`, `??`, `D `, `R `, …). The client
   * only needs the first two characters; it renders the label itself.
   */
  status: string
  /** Whether the file is untracked (`??`), which the UI groups separately. */
  untracked: boolean
}

/** The work tree's cleanliness, as the switch guard reports it. */
export interface WorkTreeStatus {
  /** Whether the repository root that was inspected. */
  workTree: string
  /** The branch HEAD is on, or null when detached. */
  branch: string | null
  /** Uncommitted entries (tracked modifications + untracked files). */
  changes: WorkTreeChange[]
  /**
   * Whether {@link changes} was truncated at {@link MAX_STATUS_ENTRIES}. The UI
   * says "and N more" rather than rendering an unbounded list.
   */
  truncated: boolean
  /** Total entry count before truncation. */
  total: number
}

/**
 * Cap on reported entries. A dirty tree can hold tens of thousands of paths
 * (a stray `node_modules`), and this rides a click on a menu row — the dialog
 * only needs to say "this tree is dirty, here is a sample".
 */
export const MAX_STATUS_ENTRIES = 200

/**
 * Read the work tree's uncommitted state, for the pre-switch guard.
 *
 * `git status --porcelain=v1 -z` is the machine-stable form: `-z` NUL-terminates
 * entries and, crucially, does NOT quote or escape paths, so a filename with a
 * space, quote, or newline survives intact. With renames (`R`), `-z` emits the
 * NEW path first and the source second as two separate NUL-terminated fields
 * sharing one status record — the second field MUST be consumed or the parse
 * desynchronises and every later entry is garbage. That consumption is the one
 * subtle part of this function.
 *
 * `--untracked-files=all` lists individual files rather than collapsing a new
 * directory to `dir/`, because the dialog names files the user will recognise.
 *
 * This is a READ. It never mutates the work tree — the guard only informs the
 * user; discarding is an explicit, separate action.
 *
 * @param path - absolute workspace path (the repository may be an ancestor).
 * @returns the status, or `changes: []` for a clean tree.
 * @throws WorkspaceGitError when the path is not a repository or git fails.
 */
export async function workTreeStatus(path: string): Promise<WorkTreeStatus> {
  const workTree = await findWorkTree(path)
  if (workTree === undefined) {
    throw new WorkspaceGitError('bad-request', 'not a git repository', 400)
  }

  // `--no-optional-locks` keeps this read from taking the index lock: the guard
  // runs on a click, and a concurrent `git switch` in another terminal must not
  // fail because we held `index.lock` for a read. `runGitRaw` (not `runGit`)
  // because porcelain status is position-sensitive — see its doc comment.
  const raw = await runGitRaw(
    workTree,
    ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
    'failed to read work tree status',
  )
  const current = await runGit(
    workTree,
    ['--no-optional-locks', 'branch', '--show-current'],
    'failed to read current branch',
  ).catch(() => '')

  // NUL-separated fields. A rename record is `R  <new>\0<old>\0`.
  const fields = raw.split('\0')
  const changes: WorkTreeChange[] = []
  let total = 0
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i]
    if (entry === undefined || entry.length < 4) continue
    const status = entry.slice(0, 2)
    const filePath = entry.slice(3)
    if (filePath === '') continue
    total += 1
    // A rename/copy carries a SECOND path field (the source). Consume it so the
    // next iteration starts on a real record.
    if (status.startsWith('R') || status.startsWith('C')) i += 1
    if (changes.length < MAX_STATUS_ENTRIES) {
      changes.push({ path: filePath, status, untracked: status === '??' })
    }
  }

  return {
    workTree,
    branch: current === '' ? null : current,
    changes,
    truncated: total > changes.length,
    total,
  }
}
