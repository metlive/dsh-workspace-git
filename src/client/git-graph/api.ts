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
 * Resolve every branch/tag tip of one repository.
 *
 * Needed by the branch filter: the graph is paginated and `--decorate` names a
 * ref only on the commit it points at, so the tip of a selected branch is often
 * absent from the loaded commits. Without this map, filtering by such a branch
 * would resolve to no walk root and show an empty graph.
 * @param path - absolute workspace path.
 * @param signal - optional abort.
 * @returns short ref name -> object id (empty for a non-repository).
 */
export async function fetchRefTips(
  path: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  let response: Response
  try {
    response = await fetch('/workspace-git/api/tips', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
      signal,
    })
  } catch (error) {
    throw new WorkspaceGitApiError('network', error instanceof Error ? error.message : String(error))
  }
  const parsed: { ok?: boolean; value?: { tips?: Record<string, string> }; error?: { code?: string; message?: string } } | null
    = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
    throw new WorkspaceGitApiError(
      parsed?.error?.code ?? 'http',
      parsed?.error?.message ?? `HTTP ${response.status}`,
    )
  }
  return parsed.value.tips ?? {}
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
