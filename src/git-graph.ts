/**
 * Host-side commit-graph snapshot: runs `git log` in the work tree and parses
 * the same record format ZCode uses. Branch detection elsewhere stays file-
 * based; the graph is the one place a git binary is required, because a full
 * topo history is not practical to rebuild from loose objects alone.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseGitDirPointer } from './git-ref.ts'
import { MAX_WALK_DEPTH } from './git-branch.ts'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { stat } from 'node:fs/promises'

const execFileAsync = promisify(execFile)

/** Field separator inside one commit record (`%x00`). */
const FIELD_SEP = '\0'
/** Record separator between commits (`%x1e`). */
const RECORD_SEP = '\x1e'

/** Default page size (matches ZCode's UI page). */
export const DEFAULT_GRAPH_PAGE_SIZE = 50
/** Hard cap so a huge repo cannot flood the response. */
export const MAX_GRAPH_PAGE_SIZE = 200

/** One ref decoration on a commit. */
export type GitGraphRefKind = 'branch' | 'remote' | 'tag' | 'head'

/** One ref decoration. */
export interface GitGraphRef {
  name: string
  kind: GitGraphRefKind
}

/** One commit of the graph page. */
export interface GitGraphCommit {
  hash: string
  parents: string[]
  refs: GitGraphRef[]
  subject: string
  authorName: string | null
  authoredAtMs: number | null
}

/** One graph page. */
export interface GitGraphSnapshot {
  commits: GitGraphCommit[]
  hasMore: boolean
}

/**
 * Resolve whether `gitEntry` is a usable git directory (dir or gitdir pointer).
 * @param gitEntry - absolute path of the `.git` entry.
 * @returns true when a repository is present at this entry.
 */
async function isGitEntry(gitEntry: string): Promise<boolean> {
  try {
    const info = await stat(gitEntry)
    if (info.isDirectory()) return true
    if (!info.isFile()) return false
    const text = await readFile(gitEntry, 'utf8').catch(() => undefined)
    if (text === undefined) return false
    return parseGitDirPointer(text) !== undefined
  } catch {
    return false
  }
}

/**
 * Walk upward from `startPath` to the work-tree root (directory holding `.git`).
 * @param startPath - absolute workspace path.
 * @returns the work-tree root, or undefined.
 */
export async function findWorkTree(startPath: string): Promise<string | undefined> {
  let current = startPath
  for (let depth = 0; depth <= MAX_WALK_DEPTH; depth += 1) {
    if (await isGitEntry(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
  return undefined
}

function addRef(refs: GitGraphRef[], next: GitGraphRef): void {
  if (refs.some(entry => entry.name === next.name && entry.kind === next.kind)) return
  refs.push(next)
}

function parseDecorationRef(rawRef: string): GitGraphRef | null {
  const ref = rawRef.trim()
  if (!ref) return null
  if (ref === 'HEAD') return { name: 'HEAD', kind: 'head' }
  if (ref.startsWith('tag: ')) {
    const tagRef = ref.slice('tag: '.length).trim()
    const name = tagRef.startsWith('refs/tags/') ? tagRef.slice('refs/tags/'.length) : tagRef
    return name ? { name, kind: 'tag' } : null
  }
  if (ref.startsWith('refs/heads/')) {
    const name = ref.slice('refs/heads/'.length)
    return name ? { name, kind: 'branch' } : null
  }
  if (ref.startsWith('refs/remotes/')) {
    const name = ref.slice('refs/remotes/'.length)
    return name ? { name, kind: 'remote' } : null
  }
  if (ref.startsWith('refs/tags/')) {
    const name = ref.slice('refs/tags/'.length)
    return name ? { name, kind: 'tag' } : null
  }
  return { name: ref, kind: ref.includes('/') ? 'remote' : 'branch' }
}

function parseRefs(rawDecorations: string): GitGraphRef[] {
  const refs: GitGraphRef[] = []
  for (const raw of rawDecorations.split(',')) {
    const decoration = raw.trim()
    if (!decoration) continue
    if (decoration.startsWith('HEAD -> ')) {
      addRef(refs, { name: 'HEAD', kind: 'head' })
      const pointed = parseDecorationRef(decoration.slice('HEAD -> '.length))
      if (pointed) addRef(refs, pointed)
      continue
    }
    const parsed = parseDecorationRef(decoration)
    if (parsed) addRef(refs, parsed)
  }
  return refs
}

/**
 * Parse `git log --format=…%x1e` stdout into commit rows.
 * @param stdout - raw git log output.
 * @returns the commits in topo/date order.
 */
export function parseGitGraphRecords(stdout: string): GitGraphCommit[] {
  return stdout
    .split(RECORD_SEP)
    .map(record => record.trim())
    .filter(record => record.length > 0)
    .map((record): GitGraphCommit | null => {
      const [hash, parents, authorName, authoredAtSeconds, subject, decorations]
        = record.split(FIELD_SEP)
      if (!hash) return null
      const timestampSeconds = authoredAtSeconds ? Number.parseInt(authoredAtSeconds, 10) : Number.NaN
      return {
        hash,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        refs: parseRefs(decorations ?? ''),
        subject: subject ?? '',
        authorName: authorName || null,
        authoredAtMs: Number.isNaN(timestampSeconds) ? null : timestampSeconds * 1_000,
      }
    })
    .filter((commit): commit is GitGraphCommit => commit !== null)
}

function clampPageSize(maxCount: number | undefined): number {
  if (maxCount === undefined || !Number.isFinite(maxCount)) return DEFAULT_GRAPH_PAGE_SIZE
  return Math.min(MAX_GRAPH_PAGE_SIZE, Math.max(1, Math.floor(maxCount)))
}

function clampSkip(skip: number | undefined): number {
  if (skip === undefined || !Number.isFinite(skip)) return 0
  return Math.max(0, Math.floor(skip))
}

/**
 * Fetch one page of the commit graph for the repository containing `path`.
 * @param path - absolute workspace path.
 * @param maxCount - page size (default 50, max 200).
 * @param skip - how many commits to skip.
 * @returns commits plus whether another page exists; empty when not a repo.
 */
export async function fetchCommitGraph(
  path: string,
  maxCount?: number,
  skip?: number,
): Promise<GitGraphSnapshot> {
  const workTree = await findWorkTree(path)
  if (workTree === undefined) return { commits: [], hasMore: false }

  const pageSize = clampPageSize(maxCount)
  const offset = clampSkip(skip)
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        'log',
        'HEAD',
        '--branches',
        '--tags',
        '--remotes',
        '--date-order',
        '--topo-order',
        `--skip=${offset}`,
        `--max-count=${pageSize + 1}`,
        `--format=%H%x00%P%x00%an%x00%at%x00%s%x00%D%x1e`,
      ],
      {
        cwd: workTree,
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    )
    const parsed = parseGitGraphRecords(stdout)
    return {
      commits: parsed.slice(0, pageSize),
      hasMore: parsed.length > pageSize,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    // Empty repo / no commits yet — silent empty graph, matching the plugin contract.
    if (
      message.includes('does not have any commits yet')
      || message.includes('bad default revision')
      || message.includes('unknown revision')
      || message.includes('not a git repository')
    ) {
      return { commits: [], hasMore: false }
    }
    throw error
  }
}
