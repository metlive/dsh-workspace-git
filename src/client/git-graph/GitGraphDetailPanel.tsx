/**
 * Right-hand commit detail: message block + nested changed-file tree.
 * Mounted only while a commit is selected; includes an explicit close control.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { fetchCommitDetail } from './api.ts'
import { buildFileTree, type FileTreeNode } from './fileTree.ts'
import { FileKindIcon } from './FileKindIcon.tsx'
import type { GitCommitDetail } from './types.ts'

export interface GitGraphDetailPanelProps {
  cwd: string
  hash: string
  onClose: () => void
  /**
   * Rail width CSS. Defaults match ui-trajectory's `.details`:
   * `clamp(320px, 38%, 440px)` bounded by `calc(100% - 280px)` so the commit
   * list always keeps a usable minimum. `narrowWidth` is applied by the split's
   * container query under ~900px of SPLIT width (not viewport width).
   */
  width?: string
  maxWidth?: string
  narrowWidth?: string
  labels: {
    loading: string
    error: string
    close: string
    commitInfo: string
    author: string
    time: string
    branches: string
    files: string
    filesCount: (n: number) => string
    inBranches: (n: number) => string
  }
}

function formatTime(ms: number | null): string {
  if (ms === null) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms))
  } catch {
    return ''
  }
}

const sectionTitle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
}

const metaRow: CSSProperties = {
  margin: '0 0 6px',
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-primary)',
  wordBreak: 'break-word',
}

function TreeNodeView({ node, depth }: { node: FileTreeNode; depth: number }): ReactNode {
  const [open, setOpen] = useState(depth < 2)
  const indent = 10 + depth * 16
  const rowBase: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 22,
    paddingLeft: indent,
    paddingRight: 8,
    boxSizing: 'border-box',
    fontSize: '12px',
    lineHeight: '20px',
    fontWeight: 400,
    color: 'var(--dsw-alias-label-primary)',
  }

  if (node.kind === 'file') {
    return (
      <div style={rowBase} title={node.path}>
        <span style={{ width: 10, flex: 'none' }} />
        <FileKindIcon kind="file" name={node.name} size={14} />
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 400,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
        >
          {node.name}
        </span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { setOpen(value => !value) }}
        style={{
          ...rowBase,
          width: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 0,
          lineHeight: '20px',
          textAlign: 'left',
        }}
      >
        <span aria-hidden="true" style={{
          width: 10,
          flex: 'none',
          color: 'var(--dsw-alias-label-tertiary)',
          fontSize: 10,
          lineHeight: '14px',
          textAlign: 'center',
        }}
        >
          {open ? '▾' : '▸'}
        </span>
        <FileKindIcon kind="dir" name={node.name} size={14} />
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '12px',
          fontWeight: 0,
        }}
        >
          {node.name}
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', marginLeft: 6, fontSize: '12px', fontWeight: 0 }}>
            ({node.fileCount})
          </span>
        </span>
      </button>
      {open
        ? node.children.map(child => (
          <TreeNodeView key={child.path} node={child} depth={depth + 1} />
        ))
        : null}
    </div>
  )
}

/**
 * Detail panel for one selected commit.
 */
export function GitGraphDetailPanel({
  cwd,
  hash,
  onClose,
  width = 'clamp(320px, 38%, 440px)',
  maxWidth = 'calc(100% - 280px)',
  narrowWidth = 'min(320px, 42%)',
  labels,
}: GitGraphDetailPanelProps): ReactNode {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<GitCommitDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchCommitDetail(cwd, hash)
      .then((result) => {
        if (!cancelled) setDetail(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null)
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [cwd, hash])

  const tree = useMemo(
    () => (detail === null ? [] : buildFileTree(detail.files)),
    [detail],
  )

  return (
    <aside
      data-workspace-git-graph-detail=""
      style={{
        // A flex rail, not a grid track: flex:none + an explicit width so the
        // list pane is sized by the space LEFT OVER. `height:100%` is gone on
        // purpose — `align-items:stretch` on the split already bounds the rail,
        // and a percentage height is resolved against a content-sized row.
        display: 'flex',
        flexDirection: 'column',
        flex: 'none',
        width,
        maxWidth,
        minWidth: 0,
        minHeight: 0,
        alignSelf: 'stretch',
        overflow: 'hidden',
        borderLeft: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        ['--dsh-git-graph-detail-narrow-width' as string]: narrowWidth,
      } as CSSProperties}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flex: 'none',
        height: 30,
        fontWeight: 400,
        padding: '0 6px 0 8px',
        borderBottom: '1px solid var(--dsw-alias-border-l2)',
        boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-layer-1)',
      }}
      >
        <span style={{
          font: 'var(--dsw-font-xxs-12, 12px/16px sans-serif)',
          fontWeight: 400,
          color: 'var(--dsw-alias-label-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        >
          {labels.commitInfo}
        </span>
        <button
          type="button"
          data-workspace-git-graph-detail-close=""
          aria-label={labels.close}
          title={labels.close}
          onClick={onClose}
          style={{
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            border: 'none',
            borderRadius: 3,
            background: 'transparent',
            color: 'var(--dsw-alias-label-tertiary)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: '14px',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
            e.currentTarget.style.color = 'var(--dsw-alias-label-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--dsw-alias-label-tertiary)'
          }}
        >
          ×
        </button>
      </div>
      {/*
        The scroll host is ALWAYS mounted, one per panel, so `[data-workspace-git-graph-detail-scroll]`
        is a stable contract rather than something that appears only after the
        commit detail resolves. Its children then swap between the loading,
        error and content states.
      */}
      <div
        data-workspace-git-graph-detail-scroll=""
        style={{
          display: loading || error !== null || detail === null ? 'flex' : 'block',
          flex: '1 1 0%',
          minHeight: 0,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          overscrollBehavior: 'contain',
          // Reserve the scrollbar track (trajectory does the same) so the
          // detail body does not reflow when the rail starts overflowing.
          scrollbarGutter: 'stable',
        }}
      >
        {loading ? (
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>
            {labels.loading}
          </span>
        ) : error !== null ? (
          <span style={{
            padding: 16,
            color: 'var(--dsw-alias-state-error-primary)',
            fontSize: 13,
            textAlign: 'center',
          }}
          >
            {labels.error}: {error}
          </span>
        ) : detail === null ? null : (
          <>
            <div style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--dsw-alias-border-l2)',
            }}
            >
              <p style={{
                ...metaRow,
                whiteSpace: 'pre-wrap',
                marginBottom: 10,
                fontSize: 13,
                lineHeight: '20px',
              }}
              >
                {detail.body !== '' ? `${detail.subject}\n\n${detail.body}` : detail.subject}
              </p>
              <p style={metaRow}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{labels.author}: </span>
                {detail.authorName ?? ''}
                {detail.authorEmail !== null ? ` <${detail.authorEmail}>` : ''}
              </p>
              <p style={metaRow}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{labels.time}: </span>
                {formatTime(detail.authoredAtMs)}
              </p>
              <p style={metaRow}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{labels.branches}: </span>
                {detail.refs.length === 0
                  ? '—'
                  : `${labels.inBranches(detail.refs.length)} ${detail.refs.join(', ')}`}
              </p>
            </div>
            <div style={{ padding: '12px 14px' }}>
              <h3 style={{ ...sectionTitle, fontSize: '12px', fontWeight: 0 }}>
                {labels.files}
                <span style={{ fontSize: '12px', fontWeight: 0, color: 'var(--dsw-alias-label-tertiary)', marginLeft: 6 }}>
                  {labels.filesCount(detail.files.length)}
                </span>
              </h3>
              {tree.length === 0 ? (
                <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }}>
                  —
                </div>
              ) : tree.map(node => (
                <TreeNodeView key={node.path} node={node} depth={0} />
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
