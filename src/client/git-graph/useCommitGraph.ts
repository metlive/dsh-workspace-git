/**
 * Shared commit-graph load state for the modal dialog and session view.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCommitGraph } from './api.ts'
import type { GitGraphCommit } from './types.ts'

const PAGE_SIZE = 50

export interface UseCommitGraphResult {
  loading: boolean
  loadingMore: boolean
  error: string | null
  commits: GitGraphCommit[]
  hasMore: boolean
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
export function useCommitGraph(cwd: string, enabled: boolean): UseCommitGraphResult {
  const [loading, setLoading] = useState(enabled)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commits, setCommits] = useState<GitGraphCommit[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const loadingMoreRef = useRef(false)
  const generationRef = useRef(0)
  const prevInputRef = useRef({ cwd, enabled })

  const prev = prevInputRef.current
  if (prev.cwd !== cwd || prev.enabled !== enabled) {
    const cwdChanged = prev.cwd !== cwd
    const enabledChanged = prev.enabled !== enabled
    prevInputRef.current = { cwd, enabled }

    if (!enabled) {
      generationRef.current += 1
      setLoading(false)
      setLoadingMore(false)
      loadingMoreRef.current = false
    } else if (enabledChanged || cwdChanged) {
      generationRef.current += 1
      setLoading(true)
      setLoadingMore(false)
      loadingMoreRef.current = false
      setError(null)
      setCommits([])
      setHasMore(false)
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
    setSelected(null)
    try {
      const result = await fetchCommitGraph(cwd, PAGE_SIZE, 0)
      if (generation !== generationRef.current) return
      setCommits(result.commits)
      setHasMore(result.hasMore)
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
  }, [cwd])

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
    selected,
    setSelected,
    loadMore: () => { void loadMore() },
    reload: () => { void loadInitial() },
  }
}
