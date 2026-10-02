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
