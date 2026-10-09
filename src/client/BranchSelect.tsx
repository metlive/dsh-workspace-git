/**
 * The composer's branch selector: a pill at the right of the chat input row
 * showing the workspace's current branch, opening a searchable list of the
 * repository's local and remote-tracking branches plus a "Git Graph" footer
 * action.
 *
 * Layout mirrors the shell's branch picker card:
 *   1. search field at the top ("搜索分支")
 *   2. "本地分支" / "远程分支" headings + filtered refs (default: at most 10
 *      rows per group; search raises the cap)
 *   3. create-branch + "Git 图谱" footer
 *
 * Both the pill and every row of its list lead with the branch glyph
 * ({@link BranchIcon}), so a branch is recognizable as one before its name is
 * read.
 *
 * Picking a local branch runs `git switch`; picking a remote-tracking ref
 * creates or reuses a local tracking branch. Clicking the already-current
 * branch only closes the menu. "Git Graph" opens the in-plugin commit-graph
 * dialog.
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
import { Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { checkoutBranch, createBranch, fetchRefs, fetchWorkTreeStatus, WorkspaceGitApiError, type RefAnswer, type RefKind, type WorkTreeStatus } from './api.ts'
import { BranchIcon } from './BranchIcon.tsx'
import { GraphIcon } from './GraphIcon.tsx'
import { NewBranchIcon } from './NewBranchIcon.tsx'
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

/**
 * How long a switch-failure notice stays visible, in milliseconds.
 *
 * A FAILED switch must not look like a no-op, which is exactly what a short
 * trigger tooltip produced: the pill kept its old name (correct — HEAD did not
 * move) and the graph stayed put (also correct), so the only evidence was a
 * `title` that required a hover and vanished after ~2.4s. The notice is now
 * rendered inline below the trigger and persists long enough to read, while
 * still clearing on its own so a stale failure cannot linger over a later
 * successful switch.
 */
const ERROR_FEEDBACK_MS = 12_000

/**
 * Default visible rows per group (local / remote) when the search box is empty.
 *
 * The host returns refs sorted by loose-ref mtime descending, but refs packed
 * into `packed-refs` carry no mtime and therefore fall back to name order — so
 * in a long-lived repository this window is "first 10 by name", not "10 most
 * recently used". The client only truncates; it cannot improve the ordering.
 */
const DEFAULT_VISIBLE_PER_GROUP = 10

/** Bound on each filtered group while searching, so a huge repo cannot flood the DOM. */
const MAX_SEARCH_REFS = 200

/**
 * Upper bound on the branch card's height, in pixels.
 *
 * The card is a portal anchored above the composer, so without a cap a tall
 * window plus the search filter (which raises the per-group limit to
 * {@link MAX_SEARCH_REFS}) lets the list grow until it covers most of the
 * viewport. 500px keeps long ref lists scrollable without hiding the
 * conversation.
 *
 * This is a MAXIMUM, not a fixed height: the card stays content-sized, so a
 * repository with a handful of refs keeps the short card it always had. Only
 * the overflowing case changes — past the cap the list scrolls internally
 * while the search field and the footer rows stay pinned.
 */
const MENU_MAX_HEIGHT_PX = 500

/**
 * The cap as a CSS max-height, bounded by the viewport.
 *
 * Applied to the card AND to the scroll host inside it. The card is a
 * content-sized flex column, so a `flex: 1 1 auto` scroll host resolves
 * against the card's content height rather than the cap; passing the same cap
 * to the host means it measures itself against the cap too, in every browser
 * (no reliance on `max-height` being treated as a definite size during layout).
 */
const MENU_MAX_HEIGHT = `min(${MENU_MAX_HEIGHT_PX}px, calc(100vh - 24px))`

/** Stable id for the footer "Git Graph" row (never collides with a ref name). */
const GIT_GRAPH_ID = '__git-graph__'

/**
 * Take up to `limit` entries, always keeping the current branch when present.
 * @param list - recent-sorted refs of one kind.
 * @param limit - max rows to keep.
 */
function takeRecent(list: readonly RefAnswer[], limit: number): RefAnswer[] {
  if (list.length <= limit) return [...list]
  const current = list.find(entry => entry.current)
  const top = list.slice(0, limit)
  if (current === undefined || top.some(entry => entry.name === current.name)) return top
  return [...top.slice(0, limit - 1), current]
}

/**
 * Normalize a wire ref that may predate the `kind` field.
 * @param entry - one ref from the host.
 */
function refKindOf(entry: RefAnswer): RefKind {
  return entry.kind === 'remote' ? 'remote' : 'local'
}

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
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  /**
   * The pending switch parked behind the dirty-tree guard: the repository, the
   * target ref, and the status that triggered the dialog. Non-null means the
   * dialog is open.
   *
   * `path` travels WITH the target rather than being re-read from `cwd` at
   * confirm time. Both halves of that are deliberate: the guard exists to
   * describe one specific switch (so a re-derived target could confirm a
   * different one than the user was shown), and the repository to switch in is
   * part of that description (so a session change while the dialog is open
   * cannot redirect the checkout).
   */
  const [guard, setGuard] = useState<{
    path: string
    name: string
    kind: RefKind
    status: WorkTreeStatus
  } | null>(null)
  const [fixedPos, setFixedPos] = useState<CSSProperties | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /**
   * Generation counter for the pre-switch dirty check. Only the newest click may
   * act on its result; see {@link switchTo}.
   */
  const switchSeq = useRef(0)
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

  const grouped = useMemo(() => {
    const list = refs ?? []
    const needle = query.trim().toLowerCase()
    const matched = needle === ''
      ? list
      : list.filter(entry => entry.name.toLowerCase().includes(needle))
    const limit = needle === '' ? DEFAULT_VISIBLE_PER_GROUP : MAX_SEARCH_REFS
    const local = takeRecent(matched.filter(entry => refKindOf(entry) === 'local'), limit)
    const remote = takeRecent(matched.filter(entry => refKindOf(entry) === 'remote'), limit)
    return { local, remote, matchedCount: matched.length }
  }, [refs, query])

  // Mounting only once the fetch has settled makes that single measurement the
  // correct one. The trigger stays `aria-expanded` while the fetch is in flight
  // so the click is not silently dropped.
  const menuReady = refs !== null && !loading

  if (answer === undefined || answer.branch === null) return null
  const branch = answer.branch
  const selectedName = refs?.find(entry => entry.current)?.name

  /**
   * Actually run the switch, in the repository at `path`.
   *
   * `path` is a PARAMETER rather than a read of `cwd` from the closure, and
   * that is load-bearing: the promise chain outlives the render that started
   * it, so a closure read would target whatever workspace was current when the
   * click happened. If the seat re-renders for another session while the guard
   * request is in flight, the checkout would land in the previous repository
   * while `store.publish` labelled the new one.
   *
   * @param path - absolute workspace directory to switch in.
   * @param name - short local name, or `remote/branch` for tracking refs.
   * @param kind - local vs remote-tracking.
   * @returns whether the switch was actually started (false = one was already
   *   in flight, so the caller must NOT assume the target was honoured).
   */
  const performSwitch = (path: string, name: string, kind: RefKind): boolean => {
    if (switching) return false
    setSwitching(true)
    setSwitchError(null)
    void checkoutBranch(path, name, kind)
      .then((result) => {
        store?.publish(path, { branch: result.branch, detached: false })
        // Keep the menu's idea of "current" in sync if it is reopened before
        // the next refs fetch.
        setRefs(prev => prev?.map(entry => ({
          ...entry,
          current: refKindOf(entry) === 'local' && entry.name === result.branch,
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
    return true
  }

  /**
   * Requested switch: check the work tree for uncommitted work FIRST, and only
   * switch outright when it is clean.
   *
   * Why a pre-check instead of letting `git switch` fail: git refuses a switch
   * that would overwrite local modifications and prints its list to stderr, so
   * without this the user's only feedback is an error AFTER the fact — and for
   * the overwhelmingly common case (a dirty tree the user intends to keep) the
   * question "switch anyway, or stay?" is never even asked. Here the user sees
   * the files and decides.
   *
   * The check is best-effort: if it fails (no git binary, a network blip), we
   * fall through to the plain switch rather than blocking a legitimate action
   * behind a diagnostic that could not run. git's own refusal still protects
   * the work in that case.
   */
  const switchTo = (name: string, kind: RefKind): void => {
    if (cwd === undefined || cwd === '' || switching) return
    if (kind === 'local' && (name === selectedName || name === branch)) {
      close()
      return
    }
    close()
    const path = cwd
    /*
     * Sequence the pre-check. Without this, two quick clicks start two
     * independent requests whose resolution order the network decides: click A
     * (slow) then B (fast) and B's dialog opens first, then A's stale response
     * OVERWRITES it — so the dialog names A and confirming switches to A, the
     * opposite of the last click. If A's response is instead *clean*, it would
     * switch the repository outright while B's dialog sat open.
     *
     * A generation counter (the same pattern `AgentPresetStore.read` uses) makes
     * only the newest click able to act. The counter is bumped here, so any
     * earlier in-flight check is disowned the moment a new one starts.
     */
    const seq = ++switchSeq.current
    void fetchWorkTreeStatus(path)
      .then((status) => {
        if (seq !== switchSeq.current) return
        // Untracked files alone cannot block `git switch`, but they ARE
        // uncommitted work the user may not realise is there, so they still
        // warrant the dialog. `changes` covers both kinds.
        if (status.changes.length === 0) {
          performSwitch(path, name, kind)
          return
        }
        setGuard({ path, name, kind, status })
      })
      .catch(() => {
        if (seq !== switchSeq.current) return
        // Guard unavailable: proceed. Never turn a failed diagnostic into a
        // blocked switch.
        performSwitch(path, name, kind)
      })
  }

  /**
   * Confirm the parked switch from the guard dialog.
   *
   * The dialog is closed FIRST so the user is not left looking at a modal that
   * no longer describes anything, but the parked target is only discarded once
   * {@link performSwitch} reports it actually started: if a switch is already in
   * flight it returns false, and dropping the target there would close the
   * dialog with no switch, no error and no busy indicator — a silent no-op.
   */
  const confirmGuardSwitch = (): void => {
    if (guard === null || switching) return
    const { path, name, kind } = guard
    if (performSwitch(path, name, kind)) setGuard(null)
  }

  /** Dismiss the guard: keep the working tree as it is, switch nothing. */
  const cancelGuard = (): void => {
    setGuard(null)
  }

  const openGraph = (): void => {
    setGraphOpen(true)
    close()
  }

  const openCreate = (): void => {
    close()
    setCreateName('')
    setCreateError(null)
    setCreateOpen(true)
  }

  const cancelCreate = (): void => {
    setCreateOpen(false)
    setCreateName('')
    setCreateError(null)
  }

  const submitCreate = (): void => {
    if (cwd === undefined || cwd === '' || createBusy) return
    const name = createName.trim()
    if (name === '') return
    setCreateBusy(true)
    setCreateError(null)
    void createBranch(cwd, name)
      .then((result) => {
        store?.publish(cwd, { branch: result.branch, detached: false })
        cancelCreate()
      })
      .catch((err) => {
        const message = err instanceof WorkspaceGitApiError
          ? err.message
          : err instanceof Error ? err.message : String(err)
        setCreateError(message)
      })
      .finally(() => { setCreateBusy(false) })
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

  const visibleCount = grouped.local.length + grouped.remote.length
  const emptyText = (refs ?? []).length === 0
    ? label('noBranches', 'No branches')
    : label('noMatches', 'No matching branches')

  // Item count exposed for the mount regression test: section labels + each
  // visible branch row (the search field and footer are not counted as list
  // items — they are chrome around the scrollable refs).
  const sectionCount = (grouped.local.length > 0 || visibleCount === 0 ? 1 : 0)
    + (grouped.remote.length > 0 ? 1 : 0)
  const itemCount = visibleCount === 0 ? 1 : sectionCount + visibleCount

  const renderBranchRow = (entry: RefAnswer): ReactNode => {
    const kind = refKindOf(entry)
    const selected = kind === 'local' && entry.name === selectedName
    return (
      <button
        key={`${kind}:${entry.name}`}
        type="button"
        role="menuitem"
        data-workspace-git-branch={entry.name}
        data-workspace-git-kind={kind}
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
        onClick={() => { switchTo(entry.name, kind) }}
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
  }

  const sectionLabelStyle: CSSProperties = {
    padding: '4px 10px',
    fontSize: '12px',
    lineHeight: '16px',
    color: 'var(--dsw-alias-label-tertiary)',
  }

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
        // Cap only — the card stays content-sized, so a short ref list renders
        // a short card. See MENU_MAX_HEIGHT: the cap is repeated on the scroll
        // host below so the list scrolls instead of pushing the footer out.
        maxHeight: MENU_MAX_HEIGHT,
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '20px',
        // The menu surface must read as OPAQUE. `--dsw-specific-menu` is a
        // translucent fill by design (`#f8f9faf0` light / `#303136f0` dark on
        // darwin), and the shell only ever uses it *together with*
        // `backdrop-filter: var(--dsw-menu-backdrop-filter)`, which blurs the
        // content behind the card. We copied the background but not the blur,
        // so the composer showed straight through the list. A solid
        // `bg-layer-1` under the themed fill restores the intended look, and
        // the blur is kept so the card still matches shell menus where
        // supported.
        background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
        // Layer the themed translucent fill over that solid base. Two
        // background layers give an opaque result — the base colour shows
        // through the top layer's alpha — while still tracking the active
        // theme (the token flips per light/dark).
        backgroundImage: 'linear-gradient(var(--dsw-specific-menu), var(--dsw-specific-menu))',
        backdropFilter: 'var(--dsw-menu-backdrop-filter)',
        WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
        boxShadow: 'var(--dsw-elevation-prominent)',
      }}
      onClick={(e) => { e.stopPropagation() }}
    >
      <div
        style={{
          flex: 'none',
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
          flex: 'none',
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
          // Absorb the leftover space and scroll past it. `1 1 auto` (not the
          // default `0 1 auto` basis) lets the host grow to the space the card
          // actually gives it.
          flex: '1 1 auto',
          // The card is content-sized, so the host carries the cap itself:
          // without this it would measure to its full content height, overflow
          // the card's max-height, and the footer rows would be clipped away
          // instead of the list scrolling.
          maxHeight: MENU_MAX_HEIGHT,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {visibleCount === 0 ? (
          <>
            <div role="presentation" style={sectionLabelStyle}>
              {label('localBranches', 'Local branches')}
            </div>
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
          </>
        ) : (
          <>
            {grouped.local.length > 0 ? (
              <>
                <div role="presentation" style={sectionLabelStyle}>
                  {label('localBranches', 'Local branches')}
                </div>
                {grouped.local.map(renderBranchRow)}
              </>
            ) : null}
            {grouped.remote.length > 0 ? (
              <>
                <div
                  role="presentation"
                  style={{
                    ...sectionLabelStyle,
                    marginTop: grouped.local.length > 0 ? '4px' : 0,
                  }}
                >
                  {label('remoteBranches', 'Remote branches')}
                </div>
                {grouped.remote.map(renderBranchRow)}
              </>
            ) : null}
          </>
        )}
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
          data-workspace-git-create-branch=""
          style={{
            ...rowStyle,
            background: 'var(--dsw-alias-interactive-bg-hover)',
          }}
          onClick={openCreate}
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
            <NewBranchIcon size={16} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>{label('createBranch', 'Create and check out new branch…')}</span>
        </button>
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
      {/*
        A failed switch used to be invisible: the pill keeps its old name (HEAD
        did not move, so that is correct) and the only report was a trigger
        tooltip that needed a hover and cleared in ~2.4s. Git's refusal is the
        interesting part — "your local changes would be overwritten" tells the
        user exactly what to do — so it is rendered as a persistent notice.

        Absolutely positioned so it can never shift the composer's inline row
        (this seat is a flex child beside the mode controls), and
        `pointerEvents: none` so it cannot swallow clicks aimed at the pill.
      */}
      {switchError !== null ? (
        <div
          data-workspace-git-switch-error=""
          role="status"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            maxWidth: '320px',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--dsw-alias-state-error-primary)',
            background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2))',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.16)',
            color: 'var(--dsw-alias-state-error-primary)',
            fontSize: '12px',
            lineHeight: '17px',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '2px' }}>
            {label('switchFailed', 'Switch failed')}
          </strong>
          {switchError}
        </div>
      ) : null}
      {cwd !== undefined && cwd !== '' ? (
        <GitGraphDialog
          open={graphOpen}
          cwd={cwd}
          onClose={() => { setGraphOpen(false) }}
          t={t}
        />
      ) : null}
      {createOpen && cwd !== undefined && cwd !== '' ? (
        <Modal
          open={createOpen}
          onClose={cancelCreate}
          title={label('createBranch', 'Create and check out new branch…')}
          closeLabel={label('cancel', 'Cancel')}
          className="workspace-git-create-branch-dialog"
          contentClassName="workspace-git-create-branch-modal"
        >
          <form
            onSubmit={(e) => { e.preventDefault(); submitCreate() }}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <input
              autoFocus
              value={createName}
              placeholder={label('createBranchPlaceholder', 'New branch name')}
              aria-label={label('createBranchPlaceholder', 'New branch name')}
              onChange={(e) => { setCreateName(e.target.value); setCreateError(null) }}
              style={{
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: '8px',
                background: 'transparent',
                padding: '6px 10px',
                font: 'inherit',
                fontSize: '14px',
                lineHeight: '22px',
                color: 'var(--dsw-alias-label-primary)',
                outline: 'none',
              }}
            />
            {createError !== null ? (
              <div style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: '13px', lineHeight: '18px' }}>
                {label('createBranchFailed', 'Create branch failed')}: {createError}
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="submit"
                disabled={createBusy || createName.trim() === ''}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 14px',
                  background: 'var(--dsw-alias-interactive-bg-hover)',
                  color: 'var(--dsw-alias-label-primary)',
                  font: 'inherit',
                  fontSize: '14px',
                  cursor: createBusy || createName.trim() === '' ? 'default' : 'pointer',
                  opacity: createBusy || createName.trim() === '' ? 0.5 : 1,
                }}
              >
                {createBusy ? label('loading', 'Loading…') : label('createBranchConfirm', 'Create')}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {guard !== null ? (
        <Modal
          open
          onClose={cancelGuard}
          title={label('switchDirtyTitle', 'Uncommitted changes')}
          closeLabel={label('cancel', 'Cancel')}
          className="workspace-git-switch-guard-dialog"
          contentClassName="workspace-git-switch-guard-modal"
        >
          <div
            data-workspace-git-switch-guard=""
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}
          >
            <div style={{ fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }}>
              {label(
                'switchDirtyIntro',
                'This workspace has uncommitted changes. Switching to "{branch}" may fail or carry them along.',
              ).replace('{branch}', guard.name)}
            </div>
            {/* The file list is the whole point of the dialog: the user cannot
                decide without seeing WHAT is dirty. It scrolls rather than
                growing the modal, because a real tree can list hundreds of
                paths (a stray node_modules would otherwise fill the screen). */}
            <div
              data-workspace-git-switch-guard-list=""
              style={{
                maxHeight: 'min(280px, 40vh)',
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '12px',
                lineHeight: '18px',
                fontFamily: 'var(--ds-font-family-code, monospace)',
              }}
            >
              {guard.status.changes.map((change) => (
                <div
                  key={change.path}
                  data-workspace-git-switch-guard-file=""
                  data-untracked={change.untracked ? '' : undefined}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'baseline',
                    minWidth: 0,
                  }}
                >
                  <span style={{
                    flex: 'none',
                    color: change.untracked
                      ? 'var(--dsw-alias-state-success-primary)'
                      : 'var(--dsw-alias-state-warn-primary)',
                  }}
                  >
                    {change.untracked ? label('switchDirtyUntracked', 'new') : change.status.trim() || 'M'}
                  </span>
                  <span style={{
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                    color: 'var(--dsw-alias-label-primary)',
                  }}
                  >
                    {change.path}
                  </span>
                </div>
              ))}
              {guard.status.truncated ? (
                <div style={{ color: 'var(--dsw-alias-label-tertiary)', marginTop: '6px' }}>
                  {label('switchDirtyMore', '…and {n} more').replace(
                    '{n}',
                    String(guard.status.total - guard.status.changes.length),
                  )}
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                data-workspace-git-switch-guard-cancel=""
                onClick={cancelGuard}
                style={{
                  border: '1px solid var(--dsw-alias-border-l2)',
                  borderRadius: '8px',
                  padding: '5px 14px',
                  background: 'transparent',
                  color: 'var(--dsw-alias-label-primary)',
                  font: 'inherit',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {label('switchDirtyCancel', 'Keep my changes')}
              </button>
              <button
                type="button"
                data-workspace-git-switch-guard-confirm=""
                onClick={confirmGuardSwitch}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 14px',
                  background: 'var(--dsw-alias-interactive-bg-hover)',
                  color: 'var(--dsw-alias-label-primary)',
                  font: 'inherit',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {label('switchDirtyConfirm', 'Switch anyway')}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </span>
  )
}
