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
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { GitGraphDetailPanel } from './GitGraphDetailPanel.tsx'
import { GitGraphPane } from './GitGraphPane.tsx'
import { EMPTY_FILTER, collectFacets, type FacetKind, type GraphFilter } from './filter.ts'
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
  /** Short ref name -> object id, for resolving a branch selection to a walk root. */
  refTips?: Readonly<Record<string, string>>
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
  refTips,
}: GitGraphSplitProps): ReactNode {
  const detailOpen = selectedCommitHash !== null && selectedCommitHash !== ''

  /*
   * The filter lives here rather than in the pane so it survives a pane
   * remount, and rather than in the hook so switching it never refetches: the
   * commits are already loaded and filtering is a pure transform over them.
   */
  const [filter, setFilter] = useState<GraphFilter>(EMPTY_FILTER)
  const onFilterChange = useCallback((next: GraphFilter) => { setFilter(next) }, [])

  /*
   * Prune selections that no longer name anything in the loaded commits.
   *
   * A branch switch can replace the commit page, and a filter naming a branch
   * that is no longer present would silently reduce the graph to nothing —
   * indistinguishable from "this repository is empty". A selection that can no
   * longer be resolved is therefore dropped. An EMPTY commit list is
   * deliberately NOT read as "everything vanished": that is the loading state.
   */
  useEffect(() => {
    if (commits.length === 0) return
    const available = collectFacets(commits)
    const keep = (selected: readonly string[], kinds: readonly FacetKind[]): string[] =>
      selected.filter(name => available.some(f => kinds.includes(f.kind) && f.label === name))
    setFilter((current) => {
      const next: GraphFilter = {
        branches: keep(current.branches, ['branch', 'remote']),
        tags: keep(current.tags, ['tag']),
        authors: keep(current.authors, ['author']),
      }
      const changed = next.branches.length !== current.branches.length
        || next.tags.length !== current.tags.length
        || next.authors.length !== current.authors.length
      return changed ? next : current
    })
  }, [commits])

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
          filter={filter}
          onFilterChange={onFilterChange}
          refTips={refTips}
          labels={{
            empty: t('gitGraphEmpty', 'No commits yet'),
            loadMore: t('gitGraphLoadMore', 'Load more'),
            loadingMore: t('loading', 'Loading…'),
            graph: t('gitGraphColumnGraph', 'Graph'),
            description: t('gitGraphColumnDescription', 'Description'),
            date: t('gitGraphColumnDate', 'Date'),
            author: t('gitGraphColumnAuthor', 'Author'),
            commit: t('gitGraphColumnCommit', 'Commit'),
            filter: {
              trigger: t('gitGraphFilter', 'Filter'),
              branches: t('gitGraphFilterBranches', 'Branches'),
              localBranches: t('gitGraphFilterLocal', 'Local branches'),
              remoteBranches: t('gitGraphFilterRemote', 'Remote branches'),
              tags: t('gitGraphFilterTags', 'Tags'),
              authors: t('gitGraphFilterAuthors', 'Authors'),
              clear: t('gitGraphFilterClear', 'Clear filter'),
              empty: t('gitGraphFilterEmpty', 'Nothing to filter by yet'),
              none: t('gitGraphFilterNone', 'All branches'),
              active: (n) => t('gitGraphFilterActive', '{n} filter(s) active').replace('{n}', String(n)),
              shown: (shown, total) => t('gitGraphFilterShown', '{shown} / {total} commits')
                .replace('{shown}', String(shown)).replace('{total}', String(total)),
              noMatches: t('gitGraphFilterNoMatches', 'No commits match the current filter'),
            },
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
