/**
 * Commit-graph pane: SVG lane graph + aligned commit rows.
 * Layout algorithm ported from ZCode's packages/ui git-graph; styling uses
 * `--dsw-*` tokens so it matches the DSH shell without Tailwind.
 *
 * Width follows the dialog (min 500px via dialogStyles); the table drops the
 * date/author columns under 720px viewport so the description stays readable.
 */
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react'
import { layoutGitGraph, type GitGraphCommit, type GitGraphLayoutPath } from './layout.ts'
import { GitGraphFilterControl } from './GitGraphFilter.tsx'
import {
  EMPTY_FILTER,
  collectFacets,
  filterCommits,
  isFilterActive,
  setFilterAuthor,
  setFilterBranch,
  type GraphFilter,
} from './filter.ts'

export interface GitGraphPaneProps {
  commits: readonly GitGraphCommit[]
  hasMore?: boolean
  loadingMore?: boolean
  selectedCommitHash: string | null
  onSelectCommit: (hash: string | null) => void
  onLoadMore?: () => void
  /**
   * The active facet selection. Owned by the CALLER rather than by this pane,
   * because the same filter must survive a pane remount (the graph view
   * re-renders when the session's branch store notifies).
   */
  filter?: GraphFilter
  /** Receives the next selection when a facet is toggled. */
  onFilterChange?: (next: GraphFilter) => void
  /** Short ref name -> object id, used to resolve a branch selection to a walk root. */
  refTips?: Readonly<Record<string, string>>
  /** Heads + remotes only; populates the branch filter dropdown. */
  branchTips?: Readonly<Record<string, string>>
  labels: {
    empty: string
    loadMore: string
    loadingMore: string
    graph: string
    description: string
    date: string
    author: string
    commit: string
    /** Filter chrome; omitted entirely when the caller supplies no filter. */
    filter?: {
      branches: string
      localBranches: string
      remoteBranches: string
      authors: string
      clear: string
      empty: string
      none: string
      allAuthors: string
      shown: (shown: number, total: number) => string
      /** Shown when the filter hides every commit. */
      noMatches: string
    }
  }
}

const LANE_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4']
const NODE_RADIUS = 4
const SELECTED_RING = 5.5
const GRAPH_COLUMN_MIN = 56
const LOAD_MORE_THRESHOLD = 96

/** Fluid commit-table columns (description grows; meta columns can shrink). */
const TABLE_COLS = 'minmax(0, 1fr) minmax(64px, 110px) minmax(56px, 100px) 72px'

function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

function formatTime(ms: number | null): string {
  if (ms === null) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms))
  } catch {
    return ''
  }
}

function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length]!
}

function isRelated(path: GitGraphLayoutPath, hash: string | null): boolean {
  return Boolean(hash && path.relatedHashes.includes(hash))
}

/**
 * Render the graph + commit table.
 * @param props - commits and interaction callbacks.
 * @returns the pane.
 */
export function GitGraphPane({
  commits,
  hasMore = false,
  loadingMore = false,
  selectedCommitHash,
  onSelectCommit,
  onLoadMore,
  filter,
  onFilterChange,
  refTips,
  branchTips,
  labels,
}: GitGraphPaneProps): ReactNode {
  const [hovered, setHovered] = useState<string | null>(null)

  // Facets come from the loaded page (authors/tags) plus the host branch tips
  // map (every local/remote branch), so the branch dropdown lists the whole
  // repository without offering tags as branches.
  const facets = useMemo(() => collectFacets(commits, branchTips), [commits, branchTips])

  const activeFilter = filter ?? EMPTY_FILTER
  const filterOn = isFilterActive(activeFilter)

  /*
   * Filtering happens BEFORE layout, and that ordering is the whole design.
   *
   * The layout engine resolves a parent absent from its input to a sentinel
   * vertex and BREAKS the line there, so handing it a filtered subset produces
   * a graph that is internally consistent by construction: no path can
   * reference a hidden commit, lanes renumber from zero, and the canvas shrinks
   * to the lanes actually in use. Filtering AFTER layout — or merely hiding
   * rows with CSS — would leave orphaned segments and gaps, which is exactly
   * the "residual lines / misalignment" failure this avoids.
   *
   * `filterCommits` returns the SAME array when no filter is active, which
   * keeps this memo stable for the default case.
   */
  const visibleCommits = useMemo(
    () => filterCommits(commits, activeFilter, refTips),
    [commits, activeFilter, refTips],
  )

  const layout = useMemo(() => layoutGitGraph(visibleCommits, { rowHeight: 30 }), [visibleCommits])
  const graphWidth = Math.max(layout.width + 12, GRAPH_COLUMN_MIN)

  const onBranchChange = useCallback((branch: string) => {
    onFilterChange?.(setFilterBranch(activeFilter, branch))
  }, [activeFilter, onFilterChange])

  const onAuthorChange = useCallback((author: string) => {
    onFilterChange?.(setFilterAuthor(activeFilter, author))
  }, [activeFilter, onFilterChange])

  const onClearFilter = useCallback(() => {
    onFilterChange?.(EMPTY_FILTER)
  }, [onFilterChange])

  const filterToolbar = labels.filter !== undefined && onFilterChange !== undefined ? (
    <GitGraphFilterControl
      facets={facets}
      filter={activeFilter}
      onBranchChange={onBranchChange}
      onAuthorChange={onAuthorChange}
      onClear={onClearFilter}
      shownCount={visibleCommits.length}
      totalCount={commits.length}
      labels={labels.filter}
    />
  ) : null

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!hasMore || loadingMore || !onLoadMore) return
    const target = event.currentTarget
    const distance = target.scrollHeight - target.scrollTop - target.clientHeight
    if (distance <= LOAD_MORE_THRESHOLD) onLoadMore()
  }, [hasMore, loadingMore, onLoadMore])

  const shellStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${graphWidth}px minmax(0, 1fr)`,
    width: '100%',
    minWidth: 0,
  }

  const colsStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: TABLE_COLS,
    minWidth: 0,
  }

  // An unfiltered empty graph means "no commits"; a filtered one means the
  // selection matched nothing. Those are different states, and saying so is the
  // difference between "this repo is empty" and "your filter hid everything".
  if (visibleCommits.length === 0) {
    return (
      <div
        data-workspace-git-graph-pane=""
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {filterToolbar}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '1 1 0%',
          minHeight: '240px',
          color: 'var(--dsw-alias-label-tertiary)',
          fontSize: '14px',
          padding: '16px',
          textAlign: 'center',
        }}
        >
          {filterOn && labels.filter !== undefined && commits.length > 0
            ? labels.filter.noMatches
            : labels.empty}
        </div>
      </div>
    )
  }

  return (
    <div
      data-workspace-git-graph-pane=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {filterToolbar}
      <div
        data-git-graph-header=""
        style={{
          ...shellStyle,
          flex: 'none',
          boxSizing: 'border-box',
          borderBottom: '1px solid var(--dsw-alias-border-l2)',
          font: 'var(--dsw-font-xxs-12, 12px/16px sans-serif)',
          overflow: 'hidden',
          color: 'var(--dsw-alias-label-tertiary)',
          background: 'var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2))',
          alignItems: 'center',
        }}
      >
        <div style={{
          boxSizing: 'border-box',
          padding: '0 8px',
          borderRight: '1px solid var(--dsw-alias-border-l2)',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}
        >
          {labels.graph}
        </div>
        <div data-git-graph-cols="" style={{
          ...colsStyle,
          boxSizing: 'border-box',
          alignItems: 'center',
          overflow: 'hidden',
        }}
        >
          <div style={{ padding: '0 8px', overflow: 'hidden' }}>{labels.description}</div>
          <div data-git-graph-meta="" style={{ padding: '0 8px', overflow: 'hidden' }}>{labels.date}</div>
          <div data-git-graph-meta="" style={{ padding: '0 8px', overflow: 'hidden' }}>{labels.author}</div>
          <div style={{ padding: '0 8px', overflow: 'hidden' }}>{labels.commit}</div>
        </div>
      </div>

      <div
        data-git-graph-body=""
        onScroll={onScroll}
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain',
          width: '100%',
          // Reserve the scrollbar track (trajectory's tablePane relies on the
          // split's scrollbar vars; the gutter keeps the commit graph column
          // from shifting when paging pushes the list into overflow).
          scrollbarGutter: 'stable',
        }}
      >
        <div style={shellStyle}>
          <div style={{
            position: 'relative',
            height: layout.height + layout.rowHeight,
            borderRight: '1px solid var(--dsw-alias-border-l2)',
          }}
          >
            <svg
              width={graphWidth}
              height={layout.height + layout.rowHeight}
              viewBox={`0 0 ${graphWidth} ${layout.height + layout.rowHeight}`}
              role="img"
              aria-label={labels.graph}
              style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
            >
              {layout.paths.map(path => (
                <path
                  key={path.id}
                  d={path.path}
                  fill="none"
                  stroke={laneColor(path.laneIndex)}
                  strokeWidth={2}
                  opacity={hovered && !isRelated(path, hovered) ? 0.25 : isRelated(path, hovered) ? 1 : 0.55}
                />
              ))}
              {layout.rows.map(row => {
                const selected = row.commit.hash === selectedCommitHash
                const color = laneColor(row.laneIndex)
                return (
                  <g key={row.commit.hash}>
                    <circle
                      cx={row.x}
                      cy={row.y}
                      r={NODE_RADIUS}
                      fill={color}
                      stroke="var(--dsw-specific-menu)"
                      strokeWidth={2}
                      opacity={hovered && hovered !== row.commit.hash && !selected ? 0.7 : 1}
                    />
                    {selected ? (
                      <circle
                        cx={row.x}
                        cy={row.y}
                        r={SELECTED_RING}
                        fill="none"
                        stroke={color}
                        strokeWidth={1}
                        opacity={0.9}
                      />
                    ) : null}
                  </g>
                )
              })}
            </svg>
          </div>

          <div style={{ minWidth: 0 }}>
            {layout.rows.map(row => {
              const selected = row.commit.hash === selectedCommitHash
              const isHovered = hovered === row.commit.hash
              return (
                <button
                  key={row.commit.hash}
                  type="button"
                  data-workspace-git-graph-row={row.commit.hash}
                  data-git-graph-cols=""
                  onClick={() => { onSelectCommit(row.commit.hash) }}
                  onMouseEnter={() => { setHovered(row.commit.hash) }}
                  onMouseLeave={() => { setHovered(null) }}
                  style={{
                    ...colsStyle,
                    width: '100%',
                    height: layout.rowHeight,
                    alignItems: 'center',
                    border: 'none',
                    borderBottom: '1px solid var(--dsw-alias-border-l1)',
                    background: selected
                      ? 'var(--dsw-alias-interactive-bg-active)'
                      : isHovered
                        ? 'var(--dsw-alias-interactive-bg-hover)'
                        : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'var(--dsw-font-xxs-12, 12px/16px sans-serif)',
                    color: 'var(--dsw-alias-label-primary)',
                    padding: 0,
                  }}
                >
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minWidth: 0,
                    padding: '0 8px',
                    overflow: 'hidden',
                  }}
                  >
                    {row.commit.refs.slice(0, 3).map(ref => (
                      <span
                        key={`${row.commit.hash}:${ref.name}`}
                        style={{
                          flex: 'none',
                          maxWidth: '96px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '11px',
                          lineHeight: '18px',
                          padding: '0 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--dsw-alias-border-l2)',
                          color: 'var(--dsw-alias-label-secondary)',
                          background: ref.kind === 'head'
                            ? 'var(--dsw-alias-interactive-bg-hover)'
                            : 'transparent',
                        }}
                      >
                        {ref.name}
                      </span>
                    ))}
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                    >
                      {row.commit.subject || shortHash(row.commit.hash)}
                    </span>
                    {row.commit.parents.length > 1 ? (
                      <span style={{ flex: 'none', color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' }}>
                        merge
                      </span>
                    ) : null}
                  </span>
                  <span
                    data-git-graph-meta=""
                    style={{
                      padding: '0 8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--dsw-alias-label-tertiary)',
                    }}
                  >
                    {formatTime(row.commit.authoredAtMs)}
                  </span>
                  <span
                    data-git-graph-meta=""
                    style={{
                      padding: '0 8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--dsw-alias-label-tertiary)',
                    }}
                  >
                    {row.commit.authorName ?? '—'}
                  </span>
                  <span style={{
                    padding: '0 8px',
                    fontFamily: 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)',
                    color: 'var(--dsw-alias-label-tertiary)',
                  }}
                  >
                    {shortHash(row.commit.hash)}
                  </span>
                </button>
              )
            })}
            {hasMore && onLoadMore ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                style={{
                  width: '100%',
                  height: '30px',
                  border: 'none',
                  borderBottom: '1px solid var(--dsw-alias-border-l1)',
                  background: 'var(--dsw-alias-bg-layer-1)',
                  color: 'var(--dsw-alias-label-secondary)',
                  cursor: loadingMore ? 'default' : 'pointer',
                  font: 'var(--dsw-font-xxs-12, 12px/16px sans-serif)',
                }}
              >
                {loadingMore ? labels.loadingMore : labels.loadMore}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
