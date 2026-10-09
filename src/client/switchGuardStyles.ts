/**
 * Injected once: widens the branch-switch guard dialog (the one that asks
 * before a `git switch` that would run with uncommitted work in the tree).
 *
 * Why a stylesheet instead of an inline `style`: the shared Modal puts the
 * caller's `className` on its own card element, whose width comes from the
 * CSS-module rule `.dialog { width: min(380px, 100%) }`. An inline style would
 * have to be threaded through `Modal`, which accepts no `style` prop — and a
 * plain class would still lose to the module rule's specificity in some build
 * orders. `!important` on a class that only ever lands on this dialog is the
 * same mechanism the commit-graph dialog already uses.
 *
 * Only `width` is touched. The card's padding, gaps, radius, elevation, the
 * header/close chrome, and the body's internal layout all stay exactly as the
 * primitive renders them, so nothing but the dialog's footprint changes.
 *
 * All three width properties are set, mirroring the preset-guide dialog's rule.
 * The base `.dialog` rule is `width: min(380px, 100%)` with no `min-width`, so
 * overriding `width` alone still leaves the card free to shrink in a constrained
 * flex context; pinning `min-width` is what makes 600px the actual rendered
 * width rather than merely its preferred one.
 *
 * The narrow-viewport branch keeps the card inside the window: Modal's root
 * reserves 24px of air on each side, so a hard 600px would overflow on a
 * phone-sized viewport instead of shrinking to fit.
 */
const STYLE_ID = 'workspace-git-switch-guard-dialog-css'

const CSS = `
.workspace-git-switch-guard-dialog {
  width: 600px !important;
  min-width: 600px !important;
  max-width: min(600px, calc(100vw - 48px)) !important;
  box-sizing: border-box !important;
}
@media (max-width: 648px) {
  .workspace-git-switch-guard-dialog {
    width: calc(100vw - 48px) !important;
    min-width: 0 !important;
  }
}
`

/** Ensure the switch-guard dialog CSS is in document.head (idempotent). */
export function ensureSwitchGuardStyles(): void {
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
