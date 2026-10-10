/**
 * Injected once: widens the Modal card for the commit graph and keeps it
 * viewport-bounded. The shared Modal defaults to 380px, which is too narrow
 * for a lane graph + commit table.
 *
 * Height is explicit on the dialog so the header/body flex split works: header
 * stays fixed full-width; only [data-git-graph-body] scrolls (scrollbar below
 * the header). Without a definite dialog height, flex:1 children collapse to 0.
 *
 * The graph split itself is a single-axis FLEX row (matching ui-trajectory) so
 * the commit list and the detail rail each own an independent scrollbar.
 */
const STYLE_ID = 'workspace-git-graph-dialog-css'

const CSS = `
.workspace-git-graph-dialog {
  width: min(1120px, calc(100vw - 48px)) !important;
  min-width: min(640px, calc(100vw - 48px)) !important;
  height: min(720px, calc(100vh - 48px)) !important;
  max-height: calc(100vh - 48px) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}
.workspace-git-graph-dialog .workspace-git-graph-modal {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
/* Modal body (header + body siblings under .content) */
.workspace-git-graph-dialog .workspace-git-graph-modal > :last-child {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  margin-top: 8px !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-root] {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  width: 100% !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-split] {
  display: flex !important;
  flex-direction: row !important;
  align-items: stretch !important;
  flex: 1 1 0% !important;
  min-height: 0 !important;
  min-width: 0 !important;
  height: 100% !important;
  width: 100% !important;
  overflow: hidden !important;
  container-type: inline-size !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-split] > * {
  min-width: 0 !important;
  min-height: 0 !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-pane] {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-list] {
  flex: 1 1 0% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
.workspace-git-graph-dialog [data-git-graph-toolbar] {
  flex: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
  overflow: visible !important;
}
/* Keep the same border after a choice; focus must not erase it. */
.workspace-git-graph-dialog [data-git-graph-filter-select],
.workspace-git-graph-dialog [data-git-graph-filter-select]:hover,
.workspace-git-graph-dialog [data-git-graph-filter-select]:focus,
.workspace-git-graph-dialog [data-git-graph-filter-select]:focus-visible,
.workspace-git-graph-dialog [data-git-graph-filter-select]:active {
  border: 1px solid var(--dsw-alias-border-l2) !important;
  outline: none !important;
  box-shadow: none !important;
  background-color: #fff !important;
}
.workspace-git-graph-dialog [data-git-graph-header] {
  flex: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  overflow: hidden !important;
  line-height: 30px !important;
  font: var(--dsw-font-xxs-12, 12px/16px sans-serif) !important;
  border-bottom: 1px solid var(--dsw-alias-border-l2) !important;
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2)) !important;
  color: var(--dsw-alias-label-tertiary) !important;
}
.workspace-git-graph-dialog [data-git-graph-header] > * {
  box-sizing: border-box !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  line-height: 30px !important;
  overflow: hidden !important;
}
/* Scroll host 1: the commit list. */
.workspace-git-graph-dialog [data-git-graph-body] {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow: auto !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
}
.workspace-git-graph-dialog [data-workspace-git-graph-detail] {
  display: flex !important;
  flex-direction: column !important;
  flex: none !important;
  align-self: stretch !important;
  min-height: 0 !important;
  overflow: hidden !important;
}
@container (max-width: 900px) {
  .workspace-git-graph-dialog [data-workspace-git-graph-detail] {
    width: var(--dsh-git-graph-detail-narrow-width, min(320px, 42%)) !important;
    max-width: 62% !important;
  }
}
/* Scroll host 2: the commit detail. Independent of scroll host 1. */
.workspace-git-graph-dialog [data-workspace-git-graph-detail-scroll] {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow: auto !important;
  scrollbar-gutter: stable;
}
@media (max-width: 720px) {
  .workspace-git-graph-dialog [data-git-graph-meta] {
    display: none !important;
  }
  .workspace-git-graph-dialog [data-git-graph-cols] {
    grid-template-columns: minmax(0, 1fr) 72px !important;
  }
}
`

/** Ensure the graph-dialog CSS is in document.head (idempotent). */
export function ensureGitGraphDialogStyles(): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) {
    existing.textContent = CSS
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
