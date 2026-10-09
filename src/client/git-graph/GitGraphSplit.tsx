/**
 * Shared graph body: list on the left; optional commit detail on the right.
 * The detail panel is closed by default and opens only when a commit is clicked.
 *
 * Layout is single-axis FLEX, mirroring ui-trajectory's split (`display:flex`
 * with a `flex:1` table pane and a `flex:none` details rail). Grid was tried
 * first and it breaks the "two independent scrollbars" contract: a
 * `grid-template-columns` track resolves against the row box, so the commit
 * list neither clipped nor scrolled and the detail pane was pushed out of the
 * viewport. Flex derives each pane's width from the space left over, which is
 * exactly what makes overflow:auto effective.
 *
 * The split also carries `container-type: inline-size` and the scrollbar
 * variables trajectory sets, so column sizing can key off the SPLIT's width
 * (container queries) instead of guessing with viewport media queries.
 */
import type { CSSProperties, ReactNode } from 'react'
import { GitGraphDetailPanel } from './GitGraphDetailPanel.tsx'
import { GitGraphPane } from './GitGraphPane.tsx'
import type { GitGraphCommit } from './types.ts'

/**
 * Details-rail width, copied from ui-trajectory's `.details` rule:
 * `width: clamp(320px, 38%, 440px)` with `max-width: calc(100% - 280px)` so the
 * list always keeps a usable minimum even in a narrow modal.
 */
const DETAILS_WIDTH = 'clamp(320px, 38%, 440px)'
const DETAILS_MAX_WIDTH = 'calc(100% - 280px)'
/** Fallback under the list's usable minimum (narrow modal / phone-width view). */
const DETAILS_NARROW_WIDTH = 'min(320px, 42%)'

export interface GitGraphSplitProps {
  cwd: string
  commits: readonly GitGraphCommit[]
  hasMore: boolean
  loadingMore: boolean
  selectedCommitHash: string | null
  onSelectCommit: (hash: string | null) => void
  onLoadMore: () => void
  t: (key: string, fallback: string) => string
}

/**
 * Split layout used by both the session view and the modal dialog.
 */
export function GitGraphSplit({
  cwd,
  commits,
  hasMore,
  loadingMore,
  selectedCommitHash,
  onSelectCommit,
  onLoadMore,
  t,
}: GitGraphSplitProps): ReactNode {
  const detailOpen = selectedCommitHash !== null && selectedCommitHash !== ''

  const splitStyle: CSSProperties = {
    // Single-axis flex: the list pane takes the leftover width, the detail rail
    // is fixed. `containerType` mirrors ui-trajectory so the pane styles can use
    // container queries keyed on the split's own width.
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    flex: '1 1 0%',
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    containerType: 'inline-size',
    // Trajectory's scrollbar palette; the shell renders `--dsh-scrollbar-*`.
    '--dsh-scrollbar-thumb': 'var(--dsw-alias-scrollbar-bg-l2)',
    '--dsh-scrollbar-thumb-hover': 'var(--dsw-alias-scrollbar-hover-l2)',
  } as CSSProperties

  return (
    <div
      data-workspace-git-graph-split=""
      data-detail-open={detailOpen ? 'true' : 'false'}
      style={splitStyle}
    >
      <div
        data-workspace-git-graph-list=""
        style={{
          // flex:1 + minWidth:0 is what makes the list a real scroll host: the
          // pane is sized by leftover space, never by content min-width.
          flex: '1 1 0%',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <GitGraphPane
          commits={commits}
          hasMore={hasMore}
          loadingMore={loadingMore}
          selectedCommitHash={selectedCommitHash}
          onSelectCommit={onSelectCommit}
          onLoadMore={onLoadMore}
          labels={{
            empty: t('gitGraphEmpty', 'No commits yet'),
            loadMore: t('gitGraphLoadMore', 'Load more'),
            loadingMore: t('loading', 'Loading…'),
            graph: t('gitGraphColumnGraph', 'Graph'),
            description: t('gitGraphColumnDescription', 'Description'),
            date: t('gitGraphColumnDate', 'Date'),
            author: t('gitGraphColumnAuthor', 'Author'),
            commit: t('gitGraphColumnCommit', 'Commit'),
          }}
        />
      </div>
      {detailOpen ? (
        <GitGraphDetailPanel
          cwd={cwd}
          hash={selectedCommitHash}
          onClose={() => { onSelectCommit(null) }}
          width={DETAILS_WIDTH}
          maxWidth={DETAILS_MAX_WIDTH}
          narrowWidth={DETAILS_NARROW_WIDTH}
          labels={{
            loading: t('loading', 'Loading…'),
            error: t('gitGraphCommitError', 'Failed to load commit'),
            close: t('close', 'Close'),
            commitInfo: t('gitGraphCommitInfo', 'Commit'),
            author: t('gitGraphColumnAuthor', 'Author'),
            time: t('gitGraphColumnDate', 'Date'),
            branches: t('gitGraphBranchInfo', 'Branches'),
            files: t('gitGraphChangedFiles', 'Changed files'),
            filesCount: (n) => t('gitGraphFilesCount', '{n} files').replace('{n}', String(n)),
            inBranches: (n) => t('gitGraphInBranches', 'In {n} refs:').replace('{n}', String(n)),
            markdown: {
              copy: t('guideCopy', 'Copy'),
              copied: t('guideCopied', 'Copied'),
              code: t('codeBlockTitle', 'Code'),
              wrap: t('codeBlockWrap', 'Wrap'),
              unwrap: t('codeBlockUnwrap', 'Unwrap'),
              footnotes: t('guideFootnotes', 'Footnotes'),
            },
          }}
        />
      ) : null}
    </div>
  )
}
