/**
 * Host-side single-commit detail: message metadata + changed file paths.
 * Used by the graph's right-hand detail panel.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { findWorkTree } from './git-graph.ts'
import { OBJECT_ID } from './git-ref.ts'
import { WorkspaceGitError } from './wire.ts'

const execFileAsync = promisify(execFile)

export interface GitCommitDetail {
  hash: string
  subject: string
  body: string
  authorName: string | null
  authorEmail: string | null
  authoredAtMs: number | null
  /** Decoration from `%D` (branches / tags / HEAD), split and trimmed. */
  refs: string[]
  /** Changed file paths relative to the work tree root. */
  files: string[]
}

/**
 * @param hash - full commit object id.
 * @throws WorkspaceGitError when the hash is not a safe object id.
 */
export function assertSafeCommitHash(hash: string): void {
  if (typeof hash !== 'string' || !OBJECT_ID.test(hash)) {
    throw new WorkspaceGitError('bad-request', 'hash must be a full git object id')
  }
}

function parseShowRecord(stdout: string): Omit<GitCommitDetail, 'files'> {
  const [hash, authorName, authorEmail, authoredAtSeconds, subjectRaw, bodyRaw, decorations]
    = stdout.split('\0')
  if (!hash || !OBJECT_ID.test(hash.trim())) {
    throw new WorkspaceGitError('bad-request', 'commit not found', 400)
  }
  const timestampSeconds = authoredAtSeconds ? Number.parseInt(authoredAtSeconds, 10) : Number.NaN
  const refs = (decorations ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('HEAD -> ')) return part.slice('HEAD -> '.length).trim() || 'HEAD'
      if (part.startsWith('tag: ')) return part.slice('tag: '.length).trim()
      return part
    })
    .filter(Boolean)
  return {
    hash: hash.trim(),
    subject: (subjectRaw ?? '').trim(),
    body: (bodyRaw ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd(),
    authorName: authorName || null,
    authorEmail: authorEmail || null,
    authoredAtMs: Number.isNaN(timestampSeconds) ? null : timestampSeconds * 1_000,
    refs,
  }
}

/**
 * Load one commit's metadata and changed file list.
 * @param path - absolute workspace path.
 * @param hash - full commit hash.
 */
export async function fetchCommitDetail(path: string, hash: string): Promise<GitCommitDetail> {
  assertSafeCommitHash(hash)
  const workTree = await findWorkTree(path)
  if (workTree === undefined) {
    throw new WorkspaceGitError('bad-request', 'not a git repository', 400)
  }
  const execOpts = {
    cwd: workTree,
    encoding: 'utf8' as const,
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  }
  try {
    const [{ stdout: showOut }, { stdout: filesOut }] = await Promise.all([
      execFileAsync(
        'git',
        ['show', '-s', '--format=%H%x00%an%x00%ae%x00%at%x00%s%x00%b%x00%D%x00', hash],
        execOpts,
      ),
      execFileAsync(
        'git',
        // `-z` is required, not cosmetic. Without it git applies C-style
        // QUOTING to any path containing a byte outside plain ASCII: a file
        // named `中文文件名.txt` comes back as the literal
        // `"\344\270\255\346\226\207..."`, and `quote"name.txt` comes back
        // wrapped and backslash-escaped. Those strings then reach the detail
        // panel's file tree as unreadable mojibake that matches no real path.
        // With `-z`, paths are emitted verbatim and NUL-terminated. Note the
        // split below therefore must NOT trim: a trailing space is a legal and
        // significant filename character.
        ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', hash],
        execOpts,
      ),
    ])
    const meta = parseShowRecord(showOut)
    const files = filesOut.split('\0').filter(name => name.length > 0)
    return { ...meta, files }
  } catch (error) {
    if (error instanceof WorkspaceGitError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new WorkspaceGitError('bad-request', message || `failed to read commit ${hash}`, 400)
  }
}
