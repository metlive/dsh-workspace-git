/**
 * Host-side branch checkout: runs `git switch` in the work tree.
 *
 * Branch detection stays file-based elsewhere; switching is the one write path
 * and needs a git binary. The branch name is validated before it reaches the
 * argv, so a crafted menu row cannot pass flags or pathspecs.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { findWorkTree } from './git-graph.ts'
import { WorkspaceGitError } from './wire.ts'

const execFileAsync = promisify(execFile)

/** Conservative allowlist for local branch names (matches common git refs). */
const SAFE_BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._][A-Za-z0-9._/-]{0,254}$/

/**
 * Reject branch names that could be mistaken for git options or pathspecs.
 * @param branch - the short local branch name from the client.
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
 */
async function runGit(workTree: string, args: readonly string[], fallback: string): Promise<void> {
  try {
    await execFileAsync('git', [...args], {
      cwd: workTree,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1 * 1024 * 1024,
    })
  } catch (error) {
    const stderr = error !== null && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr ?? '')
      : ''
    const message = (stderr.trim() || (error instanceof Error ? error.message : String(error))).trim()
    throw new WorkspaceGitError('bad-request', message || fallback, 400)
  }
}

/**
 * Checkout `branch` in the repository containing `path`.
 * @param path - absolute workspace path.
 * @param branch - short local branch name.
 * @returns the branch that is now checked out.
 * @throws WorkspaceGitError when the path is not a repo or git rejects the switch.
 */
export async function checkoutBranch(path: string, branch: string): Promise<{ branch: string }> {
  assertSafeBranchName(branch)
  const workTree = await findWorkTree(path)
  if (workTree === undefined) {
    throw new WorkspaceGitError('bad-request', 'not a git repository', 400)
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
