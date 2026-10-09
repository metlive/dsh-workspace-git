/**
 * Shared commit-graph load state for the modal dialog and session view.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCommitGraph, fetchRefTips } from './api.ts'
import type { GitGraphCommit } from './types.ts'

const PAGE_SIZE = 50

export interface UseCommitGraphResult {
  loading: boolean
  loadingMore: boolean
  error: string | null
  commits: GitGraphCommit[]
  hasMore: boolean
  /**
   * Short ref name -> object id for every branch and tag in the repository.
   *
   * Owned here because it is repository state loaded alongside the first page,
   * and because the filter needs it to resolve a selected branch to a walk root
   * even when that branch's tip is not among the loaded commits. An empty map is
   * a valid answer (not a repository, or the request failed): the filter then
   * falls back to ref decorations, which cover the tips that ARE loaded.
   */
  refTips: Record<string, string>
  selected: string | null
  setSelected: (hash: string | null) => void
  loadMore: () => void
  reload: () => void
}

/**
 * Load and paginate the commit graph for one workspace path.
 * @param cwd - absolute workspace path.
 * @param enabled - when false, skip fetch and ignore in-flight results.
 * @returns graph load state and actions.
 */
export function useCommitGraph(cwd: string, enabled: boolean, branchKey = ''): UseCommitGraphResult {
  const [loading, setLoading] = useState(enabled)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commits, setCommits] = useState<GitGraphCommit[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [refTips, setRefTips] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const loadingMoreRef = useRef(false)
  const generationRef = useRef(0)
  const prevInputRef = useRef({ cwd, enabled, branchKey })

  const prev = prevInputRef.current
  if (prev.cwd !== cwd || prev.enabled !== enabled || prev.branchKey !== branchKey) {
    const cwdChanged = prev.cwd !== cwd
    const enabledChanged = prev.enabled !== enabled
    // The checked-out branch is an identity input: `git log HEAD --branches
    // --tags --remotes` returns the same COMMITS for every branch, but the
    // `HEAD -> <name>` decoration moves with the checkout, so a stale page
    // shows HEAD on the wrong commit.
    const branchChanged = prev.branchKey !== branchKey
    prevInputRef.current = { cwd, enabled, branchKey }

    if (!enabled) {
      generationRef.current += 1
      setLoading(false)
      setLoadingMore(false)
      loadingMoreRef.current = false
    } else if (enabledChanged || cwdChanged || branchChanged) {
      generationRef.current += 1
      setLoading(true)
      setLoadingMore(false)
      loadingMoreRef.current = false
      setError(null)
      setCommits([])
      setHasMore(false)
      setRefTips({})
      setSelected(null)
    }
  }

  const loadInitial = useCallback(async () => {
    const generation = ++generationRef.current
    setLoading(true)
    setLoadingMore(false)
    loadingMoreRef.current = false
    setError(null)
    setCommits([])
    setHasMore(false)
    setRefTips({})
    setSelected(null)
    try {
      // The tips map is fetched alongside the first page and is NOT fatal: a
      // failure leaves it empty and the filter falls back to decorations, which
      // is strictly better than blocking the graph on a secondary request.
      const [result, tips] = await Promise.all([
        fetchCommitGraph(cwd, PAGE_SIZE, 0),
        fetchRefTips(cwd).catch(() => ({}) as Record<string, string>),
      ])
      if (generation !== generationRef.current) return
      setCommits(result.commits)
      setHasMore(result.hasMore)
      setRefTips(tips)
      // Keep selection null until the user clicks a row (detail panel stays closed).
      setSelected(null)
    } catch (err) {
      if (generation !== generationRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (generation === generationRef.current) {
        setLoading(false)
      }
    }
  }, [cwd, branchKey])

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1
      setLoading(false)
      setLoadingMore(false)
      loadingMoreRef.current = false
      return
    }
    void loadInitial()
  }, [enabled, loadInitial])

  const loadMore = useCallback(async () => {
    if (!enabled || loading || loadingMore || loadingMoreRef.current || !hasMore) return
    const generation = generationRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const result = await fetchCommitGraph(cwd, PAGE_SIZE, commits.length)
      if (generation !== generationRef.current) return
      setCommits(prev => [...prev, ...result.commits])
      setHasMore(result.hasMore)
    } catch {
      // Keep what we have; silent on load-more failure.
    } finally {
      if (generation === generationRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [cwd, commits.length, enabled, hasMore, loading, loadingMore])

  return {
    loading,
    loadingMore,
    error,
    commits,
    hasMore,
    refTips,
    selected,
    setSelected,
    loadMore: () => { void loadMore() },
    reload: () => { void loadInitial() },
  }
}
