/**
 * Branch/tag/author filter control for the commit graph.
 *
 * A single trigger button ("筛选") in the graph's header row, opening a popover
 * of grouped checkboxes with an active-count badge and a clear action. It is a
 * plain button + absolutely-positioned popover rather than the `Menu` primitive,
 * for one reason: `Menu` treats a click as a selection and closes, but a facet
 * panel must stay open while several boxes are ticked. The dismissal contract
 * (outside click, Escape) is the same one `Menu` implements, so nothing about
 * the interaction is novel.
 *
 * The component is presentational: it renders whatever facets it is handed and
 * reports toggles upward. All filtering logic lives in `filter.ts`.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  isFacetSelected,
  selectedCount,
  type FacetKind,
  type FacetOption,
  type GraphFilter,
} from './filter.ts'

/*
 * Why a native checkbox rather than the primitives' `Checkbox`.
 *
 * `Checkbox` IS exported by the primitives package's host build, but it is NOT
 * present in the browser module table this deployment serves: importing it made
 * the whole `conversation.view` slot throw React error #130 ("element type is
 * invalid") the moment the panel opened, taking the graph down with it. No
 * shipped plugin uses it, which is consistent with it not being part of the
 * table's public face.
 *
 * A native `<input type="checkbox">` has no such coupling, keeps the keyboard
 * and screen-reader semantics the primitive would have provided, and the
 * styling below uses the same `--dsw-*` tokens as the rest of the plugin.
 */

export interface GitGraphFilterProps {
  /** The selectable values present in the loaded commits. */
  facets: readonly FacetOption[]
  /** The active selection. */
  filter: GraphFilter
  /** Toggle one facet value. */
  onToggle: (option: FacetOption) => void
  /** Clear every dimension. */
  onClear: () => void
  /** How many commits the filter currently shows, and how many are loaded. */
  shownCount: number
  totalCount: number
  labels: {
    trigger: string
    branches: string
    localBranches: string
    remoteBranches: string
    tags: string
    authors: string
    clear: string
    empty: string
    none: string
    active: (n: number) => string
    shown: (shown: number, total: number) => string
  }
}

/** Group order and heading for each facet kind. */
function groupsOf(labels: GitGraphFilterProps['labels']): Array<{ kinds: FacetKind[]; title: string }> {
  return [
    { kinds: ['branch'], title: labels.localBranches },
    { kinds: ['remote'], title: labels.remoteBranches },
    { kinds: ['tag'], title: labels.tags },
    { kinds: ['author'], title: labels.authors },
  ]
}

const triggerStyle = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '22px',
  padding: '0 8px',
  borderRadius: '4px',
  border: `1px solid ${active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)'}`,
  background: active ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
  color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
  font: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '16px',
  height: '16px',
  padding: '0 4px',
  borderRadius: '8px',
  background: 'var(--dsw-alias-brand-primary)',
  color: '#fff',
  fontSize: '10px',
  lineHeight: '16px',
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  zIndex: 40,
  minWidth: '220px',
  maxWidth: '320px',
  maxHeight: '360px',
  overflowY: 'auto',
  padding: '8px',
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-specific-menu, var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2)))',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
}

const groupTitleStyle: CSSProperties = {
  padding: '6px 6px 4px',
  fontSize: '11px',
  color: 'var(--dsw-alias-label-tertiary)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 6px',
  fontSize: '12px',
  color: 'var(--dsw-alias-label-primary)',
}

const countStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: '11px',
  color: 'var(--dsw-alias-label-tertiary)',
}

/**
 * Render the filter control.
 * @param props - facets, the active filter, and their handlers.
 * @returns the trigger and its popover.
 */
export function GitGraphFilterControl({
  facets,
  filter,
  onToggle,
  onClear,
  shownCount,
  totalCount,
  labels,
}: GitGraphFilterProps): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const active = selectedCount(filter)

  // Dismissal: a pointer outside the control, or Escape. Listeners are only
  // attached while open, so a closed control costs nothing.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  // `active` is read through a ref-free callback so the trigger's own click does
  // not also trip the outside-click listener that just opened the panel.
  const toggleOpen = useCallback(() => { setOpen(value => !value) }, [])

  const groups = groupsOf(labels)
  const hasAnyFacet = facets.length > 0

  return (
    <div ref={rootRef} data-git-graph-filter="" style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        data-git-graph-filter-trigger=""
        data-filter-active={active > 0 ? 'true' : 'false'}
        aria-expanded={open}
        aria-haspopup="true"
        title={active > 0 ? labels.active(active) : labels.trigger}
        style={triggerStyle(active > 0)}
        onClick={toggleOpen}
      >
        {labels.trigger}
        {active > 0 ? <span style={badgeStyle}>{active}</span> : null}
      </button>

      {open ? (
        <div data-git-graph-filter-panel="" role="dialog" aria-label={labels.trigger} style={panelStyle}>
          {!hasAnyFacet ? (
            <div style={{ padding: '8px 6px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>
              {labels.empty}
            </div>
          ) : (
            <>
              <div style={{ ...rowStyle, color: 'var(--dsw-alias-label-tertiary)', paddingBottom: '6px' }}>
                {labels.shown(shownCount, totalCount)}
              </div>
              {groups.map((group) => {
                const options = facets.filter(facet => group.kinds.includes(facet.kind))
                if (options.length === 0) return null
                return (
                  <div key={group.title} data-git-graph-filter-group={group.title}>
                    <div style={groupTitleStyle}>{group.title}</div>
                    {options.map(option => (
                      <label
                        key={option.id}
                        data-git-graph-filter-option={option.id}
                        style={{ ...rowStyle, cursor: 'pointer', borderRadius: '4px' }}
                      >
                        <input
                          type="checkbox"
                          checked={isFacetSelected(filter, option)}
                          onChange={() => { onToggle(option) }}
                          style={{ margin: 0, flex: 'none', accentColor: 'var(--dsw-alias-brand-primary)' }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {option.label}
                        </span>
                        <span style={countStyle}>{option.count}</span>
                      </label>
                    ))}
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', marginTop: '6px', paddingTop: '6px' }}>
                <button
                  type="button"
                  data-git-graph-filter-clear=""
                  disabled={active === 0}
                  onClick={onClear}
                  style={{
                    width: '100%',
                    height: '24px',
                    borderRadius: '4px',
                    border: '1px solid var(--dsw-alias-border-l2)',
                    background: 'transparent',
                    color: active === 0 ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-label-primary)',
                    font: 'inherit',
                    cursor: active === 0 ? 'default' : 'pointer',
                  }}
                >
                  {labels.clear}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
