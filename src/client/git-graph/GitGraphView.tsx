/**
 * Session conversation view: commit graph gated on a known HEAD for the workspace.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { BranchStore } from '../store.ts'
import { GitGraphSplit } from './GitGraphSplit.tsx'
import { useCommitGraph } from './useCommitGraph.ts'
import { ensureGitGraphViewStyles } from './viewStyles.ts'

/** The session list snapshot face this component reads through `useSessions`. */
interface SessionListLike {
  byId: Record<string, { cwd?: string } | undefined>
}

export interface GitGraphViewProps {
  sessionId?: string
  useSessions?: <T>(selector: (state: SessionListLike) => T) => T
  t?: (key: string) => string
  store?: BranchStore
}

/**
 * Git graph session view. Renders nothing until the branch store knows HEAD.
 */
export function GitGraphView({ sessionId, useSessions, t, store }: GitGraphViewProps): ReactNode {
  const cwd = useSessions?.((state) => (sessionId === undefined ? undefined : state.byId[sessionId]?.cwd))

  const [, setRevision] = useState(0)

  useEffect(() => {
    if (store === undefined) return
    return store.subscribe(() => { setRevision((value) => value + 1) })
  }, [store])

  useEffect(() => {
    if (store === undefined || cwd === undefined || cwd === '') return
    store.request([cwd])
  }, [store, cwd])

  const answer = cwd === undefined || cwd === '' ? undefined : store?.branchOf(cwd)
  const hasHead = answer !== undefined && answer.branch !== null
  const graphEnabled = hasHead && cwd !== undefined && cwd !== ''
  /*
   * The checked-out branch name is part of the graph's identity, not just its
   * precondition.
   *
   * The route runs `git log HEAD --branches --tags --remotes`, so switching
   * branch does NOT change which commits come back — but it DOES change the
   * decorations: `HEAD -> main` moves to whatever is now checked out. Without
   * this key the view kept the previous page and the HEAD chip stayed on the
   * old commit, which reads as "nothing happened" even though the checkout
   * succeeded.
   */
  const headBranch = answer !== undefined && answer.branch !== null ? answer.branch : ''
  const graph = useCommitGraph(cwd ?? '', graphEnabled, headBranch)

  const label = (key: string, fallback: string): string => t?.(key) ?? fallback

  // The graph's stylesheets are injected by the shell-less graph pane, but only
  // once there is a graph to draw. Injecting them while the view is empty would
  // leave `body:has(...)` rules in document.head with no matching view.
  useEffect(() => {
    if (!graphEnabled) return
    ensureGitGraphViewStyles()
  }, [graphEnabled])

  // The view is ALWAYS rendered (never null) while a cwd is known, because the
  // tab ring is built from the STATIC slot ledger: the "Git Graph" tab sits
  // beside Trajectory whether or not this directory is a repository. Returning
  // null here left the tab pointing at a blank area, which read as a bug. A
  // non-repository is not an error — it just gets an explanatory empty state.
  if (cwd === undefined || cwd === '') return null

  const emptyState = (title: string, hint: string, tone: 'plain' | 'error'): ReactNode => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      flex: '1 1 0%',
      minHeight: 0,
      padding: '16px',
      textAlign: 'center',
    }}
    >
      <span style={{
        fontSize: '14px',
        color: tone === 'error'
          ? 'var(--dsw-alias-state-error-primary)'
          : 'var(--dsw-alias-label-secondary)',
      }}
      >
        {title}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>{hint}</span>
    </div>
  )

  return (
    <div
      data-workspace-git-graph-view=""
      // Same handshake ui-trajectory makes: this attribute flips the shell's
      // scrollBody to `overflow: hidden auto` and hands the view a definite
      // height (`.scrollBody:has([data-conversation-composer-overlay])`). Without
      // it the view is a flex child of a scrolling column, so its own
      // `overflow:hidden` + inner `overflow:auto` panes have no bounded box to
      // clip against and the two independent scrollbars collapse into one.
      data-conversation-composer-overlay=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0%',
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        height: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
      }}
    >
      {!hasHead ? emptyState(
        label('gitGraphNoRepo', 'This directory is not a Git repository'),
        label('gitGraphNoRepoHint', 'Initialize a repository here to see its commit graph.'),
        'plain',
      ) : graph.loading ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '240px',
          color: 'var(--dsw-alias-label-tertiary)',
          fontSize: '14px',
        }}
        >
          {label('loading', 'Loading…')}
        </div>
      ) : graph.error !== null ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '240px',
          color: 'var(--dsw-alias-state-error-primary)',
          fontSize: '14px',
          padding: '16px',
          textAlign: 'center',
        }}
        >
          {label('gitGraphError', 'Failed to load Git Graph')}: {graph.error}
        </div>
      ) : (
        <GitGraphSplit
          cwd={cwd}
          commits={graph.commits}
          hasMore={graph.hasMore}
          loadingMore={graph.loadingMore}
          selectedCommitHash={graph.selected}
          onSelectCommit={graph.setSelected}
          onLoadMore={graph.loadMore}
          t={label}
          refTips={graph.refTips}
          branchTips={graph.branchTips}
        />
      )}
    </div>
  )
}
