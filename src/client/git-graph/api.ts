/**
 * Client fetch for one page of the commit graph.
 */
import { WorkspaceGitApiError } from '../api.ts'
import type { GitCommitDetail, GitGraphResult } from './types.ts'

export type { GitGraphResult, GitGraphCommit, GitGraphRef, GitCommitDetail } from './types.ts'

/**
 * Fetch one page of commits for the graph dialog.
 */
export async function fetchCommitGraph(
  path: string,
  maxCount = 50,
  skip = 0,
  signal?: AbortSignal,
): Promise<GitGraphResult> {
  let response: Response
  try {
    response = await fetch('/workspace-git/api/graph', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, maxCount, skip }),
      signal,
    })
  } catch (error) {
    throw new WorkspaceGitApiError('network', error instanceof Error ? error.message : String(error))
  }
  const parsed: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } | null
    = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
    throw new WorkspaceGitApiError(
      parsed?.error?.code ?? 'http',
      parsed?.error?.message ?? `HTTP ${response.status}`,
    )
  }
  return parsed.value as GitGraphResult
}

/**
 * Fetch one commit's detail for the right-hand panel.
 * @param path - absolute workspace path.
 * @param hash - full commit hash.
 * @param signal - optional abort.
 */
export async function fetchCommitDetail(
  path: string,
  hash: string,
  signal?: AbortSignal,
): Promise<GitCommitDetail> {
  let response: Response
  try {
    response = await fetch('/workspace-git/api/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, hash }),
      signal,
    })
  } catch (error) {
    throw new WorkspaceGitApiError('network', error instanceof Error ? error.message : String(error))
  }
  const parsed: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } | null
    = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
    throw new WorkspaceGitApiError(
      parsed?.error?.code ?? 'http',
      parsed?.error?.message ?? `HTTP ${response.status}`,
    )
  }
  return parsed.value as GitCommitDetail
}
