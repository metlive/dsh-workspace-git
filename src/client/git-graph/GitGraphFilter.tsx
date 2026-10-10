/**
 * Branch + author filter toolbar for the commit graph.
 *
 * Two native `<select>` dropdowns sit in a compact toolbar above the commit
 * table: one for branch (local then remote), one for author ("操作者"). Native
 * selects keep the keyboard and screen-reader contract without depending on a
 * Menu primitive that closes on every click — which is the wrong interaction
 * for a facet panel, and also wrong for a single-select that should stay put
 * after a choice.
 *
 * The component is presentational: it renders whatever facets it is handed and
 * reports dimension changes upward. All filtering logic lives in `filter.ts`.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import {
  selectedCount,
  type FacetOption,
  type GraphFilter,
} from './filter.ts'

export interface GitGraphFilterProps {
  /** The selectable values present in the loaded commits. */
  facets: readonly FacetOption[]
  /** The active selection. */
  filter: GraphFilter
  /** Replace the branch dimension (empty string clears). */
  onBranchChange: (branch: string) => void
  /** Replace the author dimension (empty string clears). */
  onAuthorChange: (author: string) => void
  /** Clear every dimension. */
  onClear: () => void
  /** How many commits the filter currently shows, and how many are loaded. */
  shownCount: number
  totalCount: number
  labels: {
    branches: string
    localBranches: string
    remoteBranches: string
    authors: string
    clear: string
    empty: string
    none: string
    allAuthors: string
    shown: (shown: number, total: number) => string
  }
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
  flex: 'none',
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2))',
  minWidth: 0,
}

const fieldStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  flex: '0 1 auto',
}

const labelStyle: CSSProperties = {
  flex: 'none',
  fontSize: '12px',
  color: 'var(--dsw-alias-label-tertiary)',
  whiteSpace: 'nowrap',
}

const selectStyle: CSSProperties = {
  maxWidth: '180px',
  minWidth: '96px',
  height: '24px',
  boxSizing: 'border-box',
  padding: '0 22px 0 6px',
  borderRadius: '4px',
  border: '1px solid var(--dsw-alias-border-l2)',
  // appearance:none keeps the border under focus; native macOS selects often
  // drop it after a choice while the control still holds focus.
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundColor: '#fff',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, var(--dsw-alias-label-tertiary) 50%),'
    + 'linear-gradient(135deg, var(--dsw-alias-label-tertiary) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 12px) 10px, calc(100% - 8px) 10px',
  backgroundSize: '4px 4px, 4px 4px',
  backgroundRepeat: 'no-repeat',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: '12px',
  cursor: 'pointer',
  outline: 'none',
  boxShadow: 'none',
}

const countStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: '11px',
  color: 'var(--dsw-alias-label-tertiary)',
  whiteSpace: 'nowrap',
}

/**
 * Render the branch / author filter toolbar.
 * @param props - facets, the active filter, and their handlers.
 * @returns the toolbar with two dropdowns.
 */
export function GitGraphFilterControl({
  facets,
  filter,
  onBranchChange,
  onAuthorChange,
  onClear,
  shownCount,
  totalCount,
  labels,
}: GitGraphFilterProps): ReactNode {
  const { localBranches, remoteBranches, authors } = useMemo(() => ({
    localBranches: facets.filter(facet => facet.kind === 'branch'),
    remoteBranches: facets.filter(facet => facet.kind === 'remote'),
    authors: facets.filter(facet => facet.kind === 'author'),
  }), [facets])

  const hasBranchOptions = localBranches.length > 0 || remoteBranches.length > 0
  const hasAuthorOptions = authors.length > 0
  const hasAnyFacet = hasBranchOptions || hasAuthorOptions
  const active = selectedCount(filter) > 0

  // Dropdowns are single-select; when a legacy multi-selection is somehow
  // present, show the first value so the control never lies about being empty.
  const branchValue = filter.branches[0] ?? ''
  const authorValue = filter.authors[0] ?? ''

  return (
    <div data-git-graph-filter="" data-git-graph-toolbar="" style={toolbarStyle}>
      {!hasAnyFacet ? (
        <span style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>
          {labels.empty}
        </span>
      ) : (
        <>
          {hasBranchOptions ? (
            <label data-git-graph-filter-branch="" style={fieldStyle}>
              <span style={labelStyle}>{labels.branches}</span>
              <select
                data-git-graph-filter-select=""
                aria-label={labels.branches}
                value={branchValue}
                onChange={(event) => {
                  onBranchChange(event.target.value)
                  event.currentTarget.blur()
                }}
                style={selectStyle}
              >
                <option value="">{labels.none}</option>
                {localBranches.length > 0 ? (
                  <optgroup label={labels.localBranches}>
                    {localBranches.map(option => (
                      <option key={option.id} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {remoteBranches.length > 0 ? (
                  <optgroup label={labels.remoteBranches}>
                    {remoteBranches.map(option => (
                      <option key={option.id} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          ) : null}

          {hasAuthorOptions ? (
            <label data-git-graph-filter-author="" style={fieldStyle}>
              <span style={labelStyle}>{labels.authors}</span>
              <select
                data-git-graph-filter-select=""
                aria-label={labels.authors}
                value={authorValue}
                onChange={(event) => {
                  onAuthorChange(event.target.value)
                  event.currentTarget.blur()
                }}
                style={selectStyle}
              >
                <option value="">{labels.allAuthors}</option>
                {authors.map(option => (
                  <option key={option.id} value={option.label}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <span style={countStyle}>{labels.shown(shownCount, totalCount)}</span>

          {active ? (
            <button
              type="button"
              data-git-graph-filter-clear=""
              onClick={onClear}
              style={{
                flex: 'none',
                height: '24px',
                padding: '0 8px',
                borderRadius: '4px',
                border: '1px solid var(--dsw-alias-border-l2)',
                background: 'transparent',
                color: 'var(--dsw-alias-label-primary)',
                font: 'inherit',
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {labels.clear}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
