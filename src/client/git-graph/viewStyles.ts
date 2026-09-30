const STYLE_ID = 'workspace-git-graph-view-css'

/**
 * Session-view chrome aligned with ui-trajectory.
 *
 * Scroll only works when every ancestor is height-bounded. The split is a
 * single-axis FLEX row (`flex:1` list + `flex:none` detail rail), exactly like
 * ui-trajectory's `.split`/`.tablePane`/`.details` trio. Grid was the original
 * shape and it broke the two-scrollbar contract: `grid-template-columns` tracks
 * resolve against the row box, so the commit list was sized by content
 * min-width instead of leftover space and the detail rail was pushed out of the
 * viewport. Flex plus `min-height:0` is what makes each pane's `overflow:auto`
 * actually clip.
 */
const CSS = `
/* Conversation shell resize chrome is unused on the graph view. */
body:has([data-workspace-git-graph-view]) [data-width-handle="right"] {
  display: none !important;
}
[data-workspace-git-graph-view] {
  --dsh-git-graph-toolbar-height: 30px;
  --dsh-git-graph-bottom-clearance: calc(var(--dsh-composer-height, 152px) + 16px);

  display: flex;
  flex-direction: column;
  flex: 1 1 0%;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
}
[data-workspace-git-graph-view] [data-workspace-git-graph-split] {
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
  background: var(--dsw-alias-bg-layer-1);
}
/* Panes are bounded in BOTH axes; max-height:100% would resolve against a
   content-sized box in the old grid context, so it is deliberately absent. */
[data-workspace-git-graph-view] [data-workspace-git-graph-split] > * {
  min-width: 0 !important;
  min-height: 0 !important;
}
[data-workspace-git-graph-view] [data-workspace-git-graph-list],
[data-workspace-git-graph-view] [data-workspace-git-graph-pane] {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
  background: var(--dsw-alias-bg-layer-1);
}
/* The detail rail keeps its intrinsic width; the list absorbs the rest. */
[data-workspace-git-graph-view] [data-workspace-git-graph-detail] {
  flex: none !important;
  align-self: stretch !important;
}
@container (max-width: 900px) {
  [data-workspace-git-graph-view] [data-workspace-git-graph-detail] {
    width: var(--dsh-git-graph-detail-narrow-width, min(320px, 42%)) !important;
    max-width: 62% !important;
  }
}
[data-workspace-git-graph-view] [data-git-graph-header] {
  flex: none !important;
  height: var(--dsh-git-graph-toolbar-height) !important;
  min-height: var(--dsh-git-graph-toolbar-height) !important;
  max-height: var(--dsh-git-graph-toolbar-height) !important;
  line-height: var(--dsh-git-graph-toolbar-height) !important;
  font: var(--dsw-font-xxs-12, 12px/16px sans-serif);
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-tertiary);
}
[data-workspace-git-graph-view] [data-git-graph-header] > * {
  box-sizing: border-box;
  height: var(--dsh-git-graph-toolbar-height);
  min-height: var(--dsh-git-graph-toolbar-height);
  max-height: var(--dsh-git-graph-toolbar-height);
  line-height: var(--dsh-git-graph-toolbar-height);
  overflow: hidden;
}
/* Scroll host 1: the commit list. */
[data-workspace-git-graph-view] [data-git-graph-body] {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow: auto !important;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-bottom: var(--dsh-git-graph-bottom-clearance);
}
[data-workspace-git-graph-view] [data-workspace-git-graph-detail] {
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  overflow: hidden !important;
  border-left: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
/* Scroll host 2: the commit detail. Independent of scroll host 1. */
[data-workspace-git-graph-view] [data-workspace-git-graph-detail-scroll] {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow: auto !important;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-bottom: var(--dsh-git-graph-bottom-clearance);
}
@media (max-width: 720px) {
  [data-workspace-git-graph-view] [data-git-graph-meta] {
    display: none;
  }
  [data-workspace-git-graph-view] [data-git-graph-cols] {
    grid-template-columns: minmax(0, 1fr) 72px !important;
  }
}
`

export function ensureGitGraphViewStyles(): void {
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
