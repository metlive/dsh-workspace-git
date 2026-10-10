/**
 * Modal wrapper that loads the commit graph for a workspace path.
 * Opened from the branch menu's "Git Graph" footer.
 */
import { useEffect, type ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { ensureGitGraphDialogStyles } from './dialogStyles.ts'
import { GitGraphSplit } from './GitGraphSplit.tsx'
import { useCommitGraph } from './useCommitGraph.ts'

export interface GitGraphDialogProps {
  open: boolean
  cwd: string
  onClose: () => void
  t?: (key: string) => string
}

/**
 * Commit-graph dialog.
 */
export function GitGraphDialog({ open, cwd, onClose, t }: GitGraphDialogProps): ReactNode {
  const label = (key: string, fallback: string): string => t?.(key) ?? fallback
  const graph = useCommitGraph(cwd, open)

  useEffect(() => {
    if (!open) return
    ensureGitGraphDialogStyles()
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={label('gitGraph', 'Git Graph')}
      closeLabel={label('close', 'Close')}
      className="workspace-git-graph-dialog"
      contentClassName="workspace-git-graph-modal"
    >
      <div
        data-workspace-git-graph-root=""
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {graph.loading ? (
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
    </Modal>
  )
}
