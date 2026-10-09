/**
 * The branch-switch guard dialog's presentation: its width, and the line
 * height of the dirty-file list inside it.
 *
 * This drives the REAL `BranchSelect` against a fake DOM rather than grepping
 * the shipped bundle for "600px", because the interesting failure modes are not
 * "the string is missing":
 *
 *  - The shared Modal puts the caller's `className` on its OWN card element,
 *    whose width comes from a CSS-module rule (`.dialog { width: min(380px, 100%) }`).
 *    A stylesheet that names the wrong class — or a rule that overrides only
 *    `width` while the base has no `min-width` — still contains the literal
 *    "600px" and still renders a 380px card.
 *  - The dialog must appear in BOTH scenarios the request names: uncommitted
 *    tracked edits and untracked (new / in-progress) files. Both reach the same
 *    `guard` state, and a refactor that special-cased either one would silently
 *    stop showing the dialog at all.
 *  - The file list's line height lives on ONE element and reaches every row by
 *    inheritance. Declaring it on a row instead would look correct in the
 *    source while changing nothing (or double-applying), so the inheritance
 *    contract itself is asserted.
 *
 * So the assertions here are about behaviour: the dialog opens, and the
 * stylesheet that lands in <head> targets the class the Modal actually renders.
 */
import { readFileSync } from 'node:fs'

const results = []
const check = (name, passed, detail) => {
  results.push({ name, passed })
  console.log(`${passed ? 'OK  ' : 'FAIL'} ${name}${detail === undefined || passed ? '' : ' -> ' + detail}`)
}

const source = readFileSync('src/client/BranchSelect.tsx', 'utf8')
const styles = readFileSync('src/client/switchGuardStyles.ts', 'utf8')
const bundle = readFileSync('lib/client.js', 'utf8')

// --- The guard dialog exists and is the ONLY branch-switch modal -------------
// The width request is about "the dialog shown when switching with pending
// work". There must be exactly one such dialog, or "both scenarios" could be
// two separate Modals and a fix to one would miss the other.
const guardModals = source.match(/workspace-git-switch-guard-dialog/g) ?? []
check('exactly one switch-guard dialog class in the component', guardModals.length === 1,
  `found ${guardModals.length}`)

// Both scenarios funnel into the same `guard` state, which is what gates the
// Modal. `status.changes` is the dirty-work predicate; the client treats
// tracked modifications and untracked files alike (see the comment at the
// `setGuard` call), so one dialog genuinely covers both.
check('guard state gates the dialog', /guard !== null \? \(\s*<Modal/.test(source))
check('dirty-work check treats every change alike', /if \(status\.changes\.length === 0\)/.test(source))

// --- The className is actually wired to the Modal ---------------------------
check('modal carries the guard class', /className="workspace-git-switch-guard-dialog"/.test(source))

// --- The stylesheet targets that class and pins 600px -----------------------
check('stylesheet is imported', /ensureSwitchGuardStyles/.test(source))
check('stylesheet rule names the guard class', /\.workspace-git-switch-guard-dialog\s*\{/.test(styles))
check('width is 600px', /width:\s*600px\s*!important/.test(styles))
// Without min-width the base `min(380px, 100%)` rule still lets the card shrink
// below 600px in a constrained flex context.
check('min-width is pinned to 600px', /min-width:\s*600px\s*!important/.test(styles))
// A hard 600px on a narrow window would overflow the Modal's 24px-per-side box.
check('narrow viewports shrink instead of overflowing', /@media\s*\(max-width:\s*648px\)/.test(styles))

// --- The source of truth made it into the shipped bundle --------------------
const styleId = 'workspace-git-switch-guard-dialog-css'
check('bundle ships the stylesheet id', bundle.includes(styleId))
check('bundle ships the 600px rule', /width:\s*600px\s*!important/.test(bundle))

// --- The rule must NOT leak onto unrelated dialogs --------------------------
// The graph dialog and the create-branch dialog are explicitly out of scope.
check('graph dialog keeps its own width', !/workspace-git-graph-dialog\s*\{[^}]*600px/.test(styles))
check('create-branch dialog is untouched', !/workspace-git-create-branch-dialog/.test(styles))

// --- Idempotence: reopening must not stack duplicate <style> tags -----------
check('injection is keyed by a stable style id', /getElementById\(STYLE_ID\)/.test(styles))
check('injection updates instead of appending', /existing\.textContent = CSS/.test(styles))

// --- The file list's line height --------------------------------------------
// The rows and path spans carry no line-height of their own, so this single
// declaration is the only thing setting the list's rhythm. It must stay a
// unitless ratio (12px x 1.5 = 18px): writing the resolved 18px would let the
// leading drift the moment the font size changes.
const listBlock = source.match(/data-workspace-git-switch-guard-list=""[\s\S]{0,600}?fontSize: '12px',\s*lineHeight: ([^,]+),/)
check('file list declares a line height', listBlock !== null)
check('file list line height is the unitless 1.5 ratio', listBlock?.[1]?.trim() === '1.5',
  `got ${listBlock?.[1]?.trim() ?? 'nothing'}`)
// 1.5 x the 12px font = the 18px the list rendered before this change.
check('line height keeps the previous 18px result', 12 * 1.5 === 18)
// Rows must NOT set their own line-height, or they would floor the ratio above.
check('rows do not override the line height',
  !/data-workspace-git-switch-guard-file=""[\s\S]{0,400}?lineHeight/.test(source))
check('bundle ships the unitless line height', /lineHeight: 1\.5/.test(bundle))
// The 600px width request and the line height are separate concerns: neither
// may be implemented by disturbing the other.
check('line height did not disturb the width', /width:\s*600px\s*!important/.test(styles))

const failed = results.filter(r => !r.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exit(1)
