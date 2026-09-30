/**
 * The composer's branch selector: a pill at the right of the chat input row
 * showing the workspace's current branch, opening a searchable list of the
 * repository's local branches plus a "Git Graph" footer action.
 *
 * Layout mirrors the shell's branch picker card:
 *   1. search field at the top ("搜索分支")
 *   2. "分支" heading + filtered local refs
 *   3. "Git 图谱" footer (no create-branch row)
 *
 * Both the pill and every row of its list lead with the branch glyph
 * ({@link BranchIcon}), so a branch is recognizable as one before its name is
 * read.
 *
 * Picking a branch runs `git switch` via the host checkout route and updates
 * the displayed HEAD. Clicking the already-current branch only closes the menu.
 * "Git Graph" opens the in-plugin commit-graph dialog.
 *
 * The trigger renders NOTHING when there is no branch to show (no session cwd,
 * a directory that is not a repository, a host route that failed). The input
 * bar's trailing cluster must not gain a control for a non-repository project.
 *
 * The list itself is fetched lazily on first open: the closed trigger only needs
 * the current branch, and a repository can hold hundreds of refs.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { checkoutBranch, fetchRefs, WorkspaceGitApiError, type RefAnswer } from './api.ts'
import { BranchIcon } from './BranchIcon.tsx'
import { GraphIcon } from './GraphIcon.tsx'
import { SearchIcon } from './SearchIcon.tsx'
import { GitGraphDialog } from './git-graph/GitGraphDialog.tsx'
import type { BranchStore } from './store.ts'

/** The session list snapshot face this component reads through `useSessions`. */
interface SessionListLike {
  byId: Record<string, { cwd?: string } | undefined>
}

/** Props the composer's input seat composes for this selector. */
export interface BranchSelectProps {
  /** The session this seat occurrence draws. */
  sessionId?: string
  /** The client session list selector hook supplied by the seat. */
  useSessions?: <T>(selector: (state: SessionListLike) => T) => T
  /** Namespace-bound translator supplied by the seat. */
  t?: (key: string) => string
  /** The plugin's branch store (supplied through the seat's inject factory). */
  store?: BranchStore
}

/** How long a switch-failure toast stays on the trigger, in milliseconds. */
const ERROR_FEEDBACK_MS = 2_400

/** Bound on the branch list the menu renders, so a huge repo cannot flood the DOM. */
const MAX_VISIBLE_REFS = 200

/** Stable id for the footer "Git Graph" row (never collides with a ref name). */
const GIT_GRAPH_ID = '__git-graph__'

/**
 * The selector. Renders null when the workspace has no branch.
 * @param props - the composed slot props.
 * @returns the trigger and its menu, or null.
 */
export function BranchSelect({ sessionId, useSessions, t, store }: BranchSelectProps): ReactNode {
  const [open, setOpen] = useState(false)
  // The trigger's intent to show the list. It leads `open` by one fetch: the
  // list must not be mounted (and therefore measured) until its final content
  // is known. See `menuReady`.
  const [opening, setOpening] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [refs, setRefs] = useState<RefAnswer[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [graphOpen, setGraphOpen] = useState(false)
  const [fixedPos, setFixedPos] = useState<CSSProperties | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const cwd = useSessions?.((state) => (sessionId === undefined ? undefined : state.byId[sessionId]?.cwd))

  // Re-render when a branch resolves after mount.
  const [, setRevision] = useState(0)
  useEffect(() => {
    if (store === undefined) return
    return store.subscribe(() => { setRevision((value) => value + 1) })
  }, [store])

  useEffect(() => {
    if (store === undefined || cwd === undefined || cwd === '') return
    store.request([cwd])
  }, [store, cwd])

  // Fetch the branch list the first time the menu opens, and re-fetch on each
  // subsequent open so a checkout made outside the UI shows up.
  //
  // `opening` — not `open` — gates the fetch: the trigger raises it, and the
  // menu is only mounted once the answer is in (see `menuReady` below).
  useEffect(() => {
    if (!opening || cwd === undefined || cwd === '') return
    let cancelled = false
    setLoading(true)
    fetchRefs(cwd)
      .then((result) => { if (!cancelled) setRefs(result.refs) })
      .catch(() => { if (!cancelled) setRefs([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [opening, cwd])

  // Show the list the moment its content is final, so the one-shot placement
  // measurement sees the real geometry. Closing intent (`opening` false) wins.
  useEffect(() => {
    if (!opening || refs === null || loading) return
    setOpen(true)
  }, [opening, refs, loading])

  useEffect(() => () => {
    if (timer.current !== undefined) clearTimeout(timer.current)
  }, [])

  // Clear the filter whenever the menu closes so the next open starts fresh.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const close = (): void => {
    setOpen(false)
    setOpening(false)
  }

  // Portal placement: horizontally centered on the trigger, open above it
  // (composer sits at the bottom of the viewport). First paint often reports
  // 0×0 for a just-mounted portal, so we wait for a real size (and re-run via
  // ResizeObserver) before committing coordinates — otherwise the card lands
  // flush-left of where it should sit.
  useLayoutEffect(() => {
    if (!open) {
      setFixedPos(null)
      return
    }
    const place = (): void => {
      const r = rootRef.current?.getBoundingClientRect()
      const listEl = listRef.current
      if (r === undefined || listEl === null) return
      const lw = listEl.offsetWidth
      const lh = listEl.offsetHeight
      // Still measuring: keep the previous (or hidden) frame until the card
      // has real geometry. Applying left = trigger.right with lw === 0 is what
      // made the first open look left-shifted.
      if (lw <= 0 || lh <= 0) return
      const MARGIN = 12
      let x = r.left + (r.width - lw) / 2
      let y = r.top - lh - 4
      x = Math.min(Math.max(x, MARGIN), window.innerWidth - lw - MARGIN)
      y = Math.min(Math.max(y, MARGIN), window.innerHeight - lh - MARGIN)
      setFixedPos({ left: x, top: y, position: 'fixed' })
    }
    place()
    // One more frame covers the case where the portal ref attaches only after
    // this layout effect's first pass. Guarded: jsdom (and some test hosts)
    // do not provide rAF.
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(place)
      : undefined
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && listRef.current !== null) {
      observer = new ResizeObserver(place)
      observer.observe(listRef.current)
    }
    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, query, refs])

  // Outside click / Escape dismiss — same contract as the Menu primitive.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!(e.target instanceof Node)) return
      if (rootRef.current?.contains(e.target) === true) return
      if (listRef.current?.contains(e.target) === true) return
      close()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const answer = cwd === undefined || cwd === '' ? undefined : store?.branchOf(cwd)

  // Defined before the memo below, which reads it. It must stay above every
  // early return: a hook that runs conditionally would break the render order.
  const label = (key: string, fallback: string): string => t?.(key) ?? fallback

  const filtered = useMemo(() => {
    const list = refs ?? []
    const needle = query.trim().toLowerCase()
    const matched = needle === ''
      ? list
      : list.filter(entry => entry.name.toLowerCase().includes(needle))
    return matched.slice(0, MAX_VISIBLE_REFS)
  }, [refs, query])

  // Mounting only once the fetch has settled makes that single measurement the
  // correct one. The trigger stays `aria-expanded` while the fetch is in flight
  // so the click is not silently dropped.
  const menuReady = refs !== null && !loading

  if (answer === undefined || answer.branch === null) return null
  const branch = answer.branch
  const selectedName = refs?.find(entry => entry.current)?.name

  const switchTo = (name: string): void => {
    if (cwd === undefined || cwd === '' || switching) return
    if (name === selectedName || name === branch) {
      close()
      return
    }
    close()
    setSwitching(true)
    setSwitchError(null)
    void checkoutBranch(cwd, name)
      .then((result) => {
        store?.publish(cwd, { branch: result.branch, detached: false })
        // Keep the menu's idea of "current" in sync if it is reopened before
        // the next refs fetch.
        setRefs(prev => prev?.map(entry => ({
          ...entry,
          current: entry.name === result.branch,
        })) ?? null)
      })
      .catch((err) => {
        const message = err instanceof WorkspaceGitApiError
          ? err.message
          : err instanceof Error ? err.message : String(err)
        setSwitchError(message)
        if (timer.current !== undefined) clearTimeout(timer.current)
        timer.current = setTimeout(() => { setSwitchError(null) }, ERROR_FEEDBACK_MS)
      })
      .finally(() => { setSwitching(false) })
  }

  const openGraph = (): void => {
    setGraphOpen(true)
    close()
  }

  const title = switchError !== null
    ? `${label('switchFailed', 'Switch failed')}: ${switchError}`
    : switching
      ? label('switching', 'Switching…')
      : answer.detached
        ? `${label('detached', 'Detached HEAD')} · ${label('openMenu', 'Show branches')}`
        : label('openMenu', 'Show branches')

  const trigger = (
    <button
      type="button"
      data-workspace-git-select=""
      aria-haspopup="menu"
      aria-expanded={open || opening}
      title={title}
      aria-label={`${label('branch', 'Branch')}: ${branch}`}
      disabled={switching}
      onClick={() => {
        // Toggle on the intent flag, not the mounted state: the first click
        // starts the fetch and the list appears as soon as it settles.
        if (opening) {
          close()
          return
        }
        setOpening(true)
        // A second open reuses the previous list only if it is already loaded;
        // otherwise stay closed until the fresh fetch lands.
        if (refs !== null) setOpen(true)
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#f1f1f1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        maxWidth: '170px',
        height: '25px',
        padding: '0 8px',
        // border: '0.5px solid var(--dsw-alias-border-l3)',
        border: '0px',
        borderRadius: '999px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit',
        fontSize: '12px',
        cursor: switching ? 'wait' : 'pointer',
        opacity: switching ? 0.7 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          color: 'inherit',
          flex: 'none',
        }}
      >
        <BranchIcon size={14} />
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {switching ? label('switching', 'Switching…') : branch}
      </span>
    </button>
  )

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    minHeight: '34px',
    padding: '5px 10px',
    border: 'none',
    borderRadius: '10px',
    background: 'transparent',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: '14px',
    lineHeight: '22px',
    color: 'var(--dsw-alias-label-primary)',
    textAlign: 'left',
  }

  const emptyText = (refs ?? []).length === 0
    ? label('noBranches', 'No local branches')
    : label('noMatches', 'No matching branches')

  // Item count exposed for the mount regression test: section label + each
  // visible branch row (the search field and footer are not counted as list
  // items — they are chrome around the scrollable refs).
  const itemCount = filtered.length === 0 ? 1 : 1 + filtered.length

  const menu = open && menuReady && createPortal(
    <div
      ref={listRef}
      role="menu"
      data-workspace-git-menu="portal"
      data-side="top"
      data-align="center"
      data-item-count={String(itemCount)}
      style={{
        ...fixedPos,
        visibility: fixedPos === null ? 'hidden' : 'visible',
        zIndex: 1100,
        boxSizing: 'border-box',
        minWidth: '240px',
        maxWidth: '360px',
        maxHeight: 'calc(100vh - 24px)',
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '20px',
        background: 'var(--dsw-specific-menu)',
        boxShadow: 'var(--dsw-elevation-prominent)',
      }}
      onClick={(e) => { e.stopPropagation() }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            flex: 'none',
            color: 'var(--dsw-alias-label-tertiary)',
          }}
        >
          <SearchIcon size={16} />
        </span>
        <input
          autoFocus
          value={query}
          placeholder={label('searchBranches', 'Search branches')}
          aria-label={label('searchBranches', 'Search branches')}
          data-workspace-git-search=""
          onChange={(e) => { setQuery(e.target.value) }}
          onKeyDown={(e) => {
            // Keep typing from bubbling into the composer / global shortcuts.
            e.stopPropagation()
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            font: 'inherit',
            fontSize: '14px',
            lineHeight: '22px',
            color: 'var(--dsw-alias-label-primary)',
          }}
        />
      </div>
      <div
        role="presentation"
        style={{
          height: '0.5px',
          margin: '0 2px 4px',
          background: 'var(--dsw-alias-border-l1)',
        }}
      />
      <div
        role="presentation"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div
          role="presentation"
          style={{
            padding: '4px 10px',
            fontSize: '12px',
            lineHeight: '16px',
            color: 'var(--dsw-alias-label-tertiary)',
          }}
        >
          {label('branch', 'Branch')}
        </div>
        {filtered.length === 0 ? (
          <div
            role="presentation"
            style={{
              padding: '8px 10px',
              fontSize: '13px',
              color: 'var(--dsw-alias-label-tertiary)',
            }}
          >
            {emptyText}
          </div>
        ) : filtered.map(entry => {
          const selected = entry.name === selectedName
          return (
            <button
              key={entry.name}
              type="button"
              role="menuitem"
              data-workspace-git-branch={entry.name}
              aria-current={selected ? 'true' : undefined}
              style={{
                ...rowStyle,
                background: selected ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = selected
                  ? 'var(--dsw-alias-interactive-bg-hover)'
                  : 'transparent'
              }}
              onClick={() => { switchTo(entry.name) }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  flex: 'none',
                  width: '16px',
                  height: '16px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--dsw-alias-label-tertiary)',
                }}
              >
                <BranchIcon size={16} />
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.name}
              </span>
              {selected ? (
                <span aria-hidden="true" style={{ flex: 'none', color: 'var(--dsw-alias-label-primary)' }}>
                  ✓
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div
        role="presentation"
        style={{
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          marginTop: '4px',
          paddingTop: '4px',
          borderTop: '0.5px solid var(--dsw-alias-border-l2)',
        }}
      >
        <button
          type="button"
          role="menuitem"
          data-workspace-git-graph=""
          id={GIT_GRAPH_ID}
          style={rowStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
          onClick={openGraph}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              flex: 'none',
              width: '16px',
              height: '16px',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dsw-alias-label-tertiary)',
            }}
          >
            <GraphIcon size={16} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>{label('gitGraph', 'Git Graph')}</span>
        </button>
      </div>
    </div>,
    document.body,
  )

  return (
    <span ref={rootRef} style={{ display: 'inline-flex', position: 'relative' }}>
      <Tooltip label={title} side="top">{trigger}</Tooltip>
      {menu}
      {cwd !== undefined && cwd !== '' ? (
        <GitGraphDialog
          open={graphOpen}
          cwd={cwd}
          onClose={() => { setGraphOpen(false) }}
          t={t}
        />
      ) : null}
    </span>
  )
}
