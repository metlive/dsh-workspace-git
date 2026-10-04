/**
 * Mount the SHIPPED client bundle exactly as the browser module loader does,
 * with real React and a fake cordis ctx, then drive the slot registrations and
 * render the agent-preset chip. This is the closest thing to the live GUI that
 * can run headless.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'

const require_ = createRequire('/Users/metlive/wwwroot/dsh-workspace-git/package.json')

// --- Capture the module the bundle registers -------------------------------
let registered
globalThis.window = {
  __ModuleLoader__: {
    load(reg) { registered = reg },
  },
}
globalThis.document = { querySelector: () => null, createElement: () => ({ dataset: {}, style: {} }), head: { appendChild() {} } }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })

// Provide the bare specifiers the factory requires, as the loader would.
const stubs = {
  'react': React,
  'react-dom': require_('react-dom'),
  'react/jsx-runtime': require_('react/jsx-runtime'),
  // The primitives package pulls peers only the running app provides, so stub
  // the two primitives this plugin uses. Rendering ITS own markup is the point.
  '@deepseek-ai/dsh-client-ui-primitives': {
    Menu: ({ anchor, items, open, children }) => React.createElement('div', { 'data-menu-open': String(open) },
      anchor,
      open ? React.createElement('div', { 'data-menu-items': String((items ?? []).length) },
        (items ?? []).map((it) => React.createElement('div', { key: it.id, 'data-item': it.id }, it.label)),
        children) : null),
    MenuItemButton: ({ children, onSelect, disabled }) => React.createElement('button', {
      type: 'button', role: 'menuitem', disabled, onClick: onSelect,
    }, children),
    Tag: ({ children, tone }) => React.createElement('span', { 'data-tag': tone ?? 'outline' }, children),
    Toast: ({ text }) => React.createElement('div', { 'data-toast': '' }, text),
    Modal: ({ open, title, description, children }) => open
      ? React.createElement('div', { 'data-modal': '', 'data-title': title }, description, children)
      : null,
    SegmentedTabs: ({ items, value }) => React.createElement('div', { 'data-tabs': value },
      (items ?? []).map((it) => React.createElement('span', { key: it.value }, it.label))),
    MarkdownText: ({ text }) => React.createElement('div', { 'data-md': '' }, text),
  },
}
const exports_ = registered
  ? null
  : (() => {
      // The bundle executes its own load() call on import.
      new Function('window', readFileSync('lib/client.js', 'utf8'))(globalThis.window)
      return registered
    })()

const loaded = registered.factory((spec) => {
  if (spec in stubs) return stubs[spec]
  throw new Error('unexpected external: ' + spec)
})

console.log('bundle exports:', Object.keys(loaded).sort().join(', '))
console.log('inject list:', JSON.stringify(loaded.inject))

// --- Real slot registry, declared as ui-conversation declares it ------------
const core = new SlotCore()
const HERO = 'conversation.hero.agentPreset'
const declare = (key, spec) => {
  const rec = core.record(key)
  rec.spec = spec
  rec.declaredBy = 'ui-conversation'
  rec.declarationEpoch = 1
}
declare(HERO, { kind: 'single', scope: 'session-maybe' })
declare('conversation.session.header.actions', { kind: 'list', scope: 'session' })
declare('conversation.input.left', { kind: 'list', scope: 'session' })
// The enhancer's seat: the trailing cluster's compact-control run, which
// ui-conversation renders immediately left of the model selector. Declared
// `list` and unoccupied in the real runtime (rev d5562dc82e23).
declare('conversation.input.right', { kind: 'list', scope: 'session' })
declare('conversation.view', { kind: 'list', scope: 'session' })

// The OFFICIAL plugin gets there first, as it does in the real page (it is
// loaded ahead of this bundle and registers at the default priority 0).
core.register({ name: HERO, locale: 'settings.agentPreset', registrant: '@deepseek-ai/dsh-client-ui-agent-preset' }, () => null)

// --- Fake cordis ctx: record slot registrations ----------------------------
const registrations = []
const effects = []
const store = {}
/** Names unavailable yet; `get` returns undefined for them, as cordis does. */
const pendingServices = new Set()
/** Deferred `ctx.inject` callbacks, keyed by the services they require. */
const deferredInjects = []
const ctx = {
  locale: {
    getSnapshot: () => ({ active: 'zh' }),
    subscribe: () => () => {},
    register: () => () => {},
  },
  slots: {
    // The REAL registry core: this is what decides whether a registration
    // throws on an occupied `single` slot.
    register: (options, component) => {
      registrations.push({ options, component })
      return core.register(options, component)
    },
    inject: (key, cb) => { store[key] = cb; return () => {} },
  },
  sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } },
  remote: {
    agentPresets: {
      list: async () => ({ ok: true, value: { presets: [
        { id: 'standard', isDefault: true },
        { id: 'cordis', isDefault: false },
      ] } }),
      select: async () => ({ ok: true, value: 'cordis' }),
    },
  },
  // Model cordis: a service whose provider fiber is not yet active reads as
  // undefined, and `ctx.inject([...])` is what waits for it.
  get(name) {
    if (pendingServices.has(name)) return undefined
    // Dotted names address a namespace of a service (`remote.agentPresets`).
    const [head, ...rest] = name.split('.')
    if (head !== 'remote') return undefined
    let value = this.remote
    for (const part of rest) value = value?.[part]
    return value
  },
  /**
   * cordis starts a child fiber that runs only once every named service exists.
   * When one is still pending the callback is held, and released by the harness
   * below once the service arrives — the exact ordering that broke the shipped
   * version, which read `ctx.get('remote')` inline instead.
   */
  inject(names, callback) {
    if (names.some((name) => pendingServices.has(name) || this.get(name) === undefined)) {
      deferredInjects.push({ names, callback })
      return () => {}
    }
    callback(this)
    return () => {}
  },
  // Cordis runs an effect callback immediately and keeps its disposer, which is
  // exactly what performs the slot registrations below.
  effect(fn) { effects.push(fn()) },
}
// THE LOAD-ORDER CASE. Activation order between client plugins is not
// constrained, so `remote` may legitimately not exist yet when apply() runs.
// The shipped version read ctx.get('remote') inline and silently registered
// nothing here; the fixed version defers through ctx.inject and recovers.
pendingServices.add('remote')
loaded.apply(ctx)
console.log('preset seats registered while remote is absent:', registrations.filter(r => r.options.name.startsWith('conversation.hero.agentPreset')).length, '(expected 0)')

// `remote` arrives.
pendingServices.delete('remote')
for (const { names, callback } of deferredInjects.splice(0)) {
  if (names.some((name) => ctx.get(name) === undefined)) { deferredInjects.push({ names, callback }); continue }
  callback(ctx)
}

// Slots register lazily through slots.inject: run every deferred callback.
for (const [key, cb] of Object.entries(store)) cb()
console.log('\nregistered slots:')
for (const r of registrations) {
  console.log('  -', r.options.name, r.options.id ? `(id=${r.options.id})` : '', 'order=' + (r.options.order ?? '-'))
}

// --- Render the agent-preset chip ------------------------------------------
const chip = registrations.find(r => r.options.name === 'conversation.hero.agentPreset')
if (!chip) { console.log('\nFAIL: chip not registered'); process.exit(1) }

const injected = chip.options.inject()
// Use the plugin's REAL zh dictionary, so a missing key would show up as a raw
// key in the assertions instead of being masked by the stub.
const { zh } = await import('./lib/client.js').then(() => ({})).catch(() => ({}))
const dict = (await import('node:fs')).readFileSync('src/client/locales.ts', 'utf8')
const zhBlock = dict.slice(dict.indexOf('export const zh'), dict.indexOf('export const en'))
const zhDict = Object.fromEntries([...zhBlock.matchAll(/^\s+(\w+): '((?:[^'\\]|\\.)*)',/gm)]
  .map(([, k, v]) => [k, v]))
const t = (k) => zhDict[k] ?? k
// renderToStaticMarkup does not run effects, so seed the store exactly as the
// component's own effect would (with the session's projected preset).
await injected.store.load('cordis')
console.log('\nstore snapshot:', JSON.stringify(injected.store.getSnapshot()))

const html = renderToStaticMarkup(
  React.createElement(chip.component, { sessionId: 'sess-1', t, store: injected.store,
    useSessions: (sel) => sel({ byId: { 'sess-1': { projectionValues: { agentPreset: 'cordis' } } } }) })
)
console.log('\nrendered chip HTML:\n' + html)

const label = registrations.find(r => r.options.name === 'conversation.session.header.actions')
const labelHtml = renderToStaticMarkup(
  React.createElement(label.component, { sessionId: 'sess-1', t, store: label.options.inject().store,
    useSessions: (sel) => sel({ byId: { 'sess-1': { projectionValues: { agentPreset: 'cordis' } } } }) })
)
console.log('\nrendered header label HTML:\n' + labelHtml)

const ok = html.includes('workspace-git-agent-preset') && html.includes('创造模式') &&
           !html.includes('Cordis 模式') &&
           html.includes('Agent 预设') && !html.includes('aria-label="agentPreset:') &&
           labelHtml.includes('Agent 预设') && labelHtml.includes('创造模式') &&
           labelHtml.includes('workspace-git-agent-preset-label')
// The contract shared with the branch pill: a deployment with no roster renders
// NOTHING rather than an error or an empty control.
const emptyStore = new (injected.store.constructor)({
  agentPresets: { list: async () => ({ ok: true, value: { presets: [] } }), select: async () => ({ ok: true, value: '' }) },
})
await emptyStore.load()
const emptyHtml = renderToStaticMarkup(React.createElement(chip.component, { sessionId: 's1', t, store: emptyStore }))
const emptyOk = emptyHtml === ''
console.log('empty roster renders nothing: ' + (emptyOk ? 'OK' : 'FAIL -> ' + emptyHtml))

// --- Seat sharing: the whole reason the chip carries priority -1 -----------
const heroEntries = core.entries(HERO)
const heroWinners = core.entriesOfSlot(HERO)
const noThrow = heroEntries.length === 2
const mineWins = heroWinners.length === 1 && heroWinners[0].component === chip.component
console.log('hero seat holds both registrations (no throw): ' + (noThrow ? 'OK' : 'FAIL -> ' + heroEntries.length))
console.log('lower priority wins the single cell: ' + (mineWins ? 'OK' : 'FAIL'))

// This chip occupies the winning cell of a `single` slot (priority -1).
// Returning null there does NOT reveal the official occupant — it empties the
// seat. Developer tools must not hide this chip; the official one is already
// shadowed and cannot paint.
const onSource = { getSnapshot: () => true, subscribe: () => () => {} }
const onHtml = renderToStaticMarkup(
  React.createElement(chip.component, { sessionId: 's1', t, store: injected.store, developerTools: onSource })
)
const showsWhenOn = onHtml.includes('data-workspace-git-agent-preset')
console.log('Developer tools ON -> chip still renders (holds the single cell): ' + (showsWhenOn ? 'OK' : 'FAIL -> ' + onHtml.slice(0, 80)))

// Developer tools OFF -> same: we are the only visible occupant.
const offSource = { getSnapshot: () => false, subscribe: () => () => {} }
const showHtml = renderToStaticMarkup(
  React.createElement(chip.component, { sessionId: 's1', t, store: injected.store, developerTools: offSource })
)
const shows = showHtml.includes('data-workspace-git-agent-preset')
console.log('Developer tools OFF -> chip renders: ' + (shows ? 'OK' : 'FAIL'))

// --- The `blank` precondition ---------------------------------------------
// A preset change is accepted only by a session that has not run yet: the Host
// refuses to adopt an existing session under a different preset. The chip must
// therefore be switchable on a BLANK session and inert on a running one — and it
// must decide this BEFORE calling select, the way the official controller does,
// rather than firing a request and relying on the refusal.
const withBlank = (blank) => renderToStaticMarkup(React.createElement(chip.component, {
  sessionId: 's1', t, store: injected.store, developerTools: offSource,
  useSessions: (sel) => sel({ byId: { s1: { blank, projectionValues: { agentPreset: 'cordis' } } } }),
}))
const blankHtml = withBlank(true)
const runningHtml = withBlank(false)
// No session row at all, and a row whose `blank` is explicitly undefined: both
// must read as "not switchable". (Here `=== true` and a loose truthiness check
// agree, because the trailing `?? false` already normalises a missing value — so
// these two cases pin the OUTCOME, not the comparison.)
const absentHtml = renderToStaticMarkup(React.createElement(chip.component, {
  sessionId: 's1', t, store: injected.store, developerTools: offSource,
  useSessions: (sel) => sel({ byId: {} }),
}))
const undefinedHtml = renderToStaticMarkup(React.createElement(chip.component, {
  sessionId: 's1', t, store: injected.store, developerTools: offSource,
  useSessions: (sel) => sel({ byId: { s1: { blank: undefined, projectionValues: { agentPreset: 'cordis' } } } }),
}))

const blankSwitchable = !blankHtml.includes('disabled')
const runningLocked = runningHtml.includes('disabled')
const absentLocked = absentHtml.includes('disabled')
const undefinedLocked = undefinedHtml.includes('disabled')
console.log('blank session -> chip switchable: ' + (blankSwitchable ? 'OK' : 'FAIL'))
console.log('running session -> chip locked: ' + (runningLocked ? 'OK' : 'FAIL'))
console.log('absent session row -> chip locked: ' + (absentLocked ? 'OK' : 'FAIL'))
console.log('undefined blank -> chip locked: ' + (undefinedLocked ? 'OK' : 'FAIL'))
// The bundle source, read once for the assertions that are about code rather
// than rendered output: the busy branch (only reachable on a click, and there is
// no DOM here to click) and the source of the `blank` guard.
const bundleSource = readFileSync('lib/client.js', 'utf8')
// The gate must read the Host's own flag. A regression that drops `blank`
// entirely still renders, so pin that the guard is actually the source.
const guardsOnBlank = /blank === true/.test(bundleSource)
const locksOnBlank = /canSwitch = sessionId !== void 0 && sessionId !== "" && sessionBlank/u.test(bundleSource)
console.log('guard reads the blank flag: ' + (guardsOnBlank ? 'OK' : 'FAIL'))
console.log('canSwitch requires it: ' + (locksOnBlank ? 'OK' : 'FAIL'))
// And the reason must be legible, not a mysteriously dead control.
const lockedExplained = /本会话已按某个预设开始/.test(runningHtml)
console.log('locked chip explains why: ' + (lockedExplained ? 'OK' : 'FAIL'))
// Both states still render the control: locking must not remove it, or the seat
// would go empty and the seat's whole point (covering the gated official chip)
// would be lost.
const stillRenders = blankHtml.includes('data-workspace-git-agent-preset')
  && runningHtml.includes('data-workspace-git-agent-preset')
console.log('locked chip still renders: ' + (stillRenders ? 'OK' : 'FAIL'))

// Display copy must match the official client plugin: `cordis` is Creator
// mode (创造模式), and built-in rows usually ship NO description field — the
// menu has to resolve the localized intro the same way `presetDisplayText` does,
// or the line under the name is always "暂无描述".
const labelsSrc = readFileSync('src/client/agent-preset/labels.ts', 'utf8')
const chipSrc = readFileSync('src/client/agent-preset/AgentPresetChip.tsx', 'utf8')
const localesSrc = readFileSync('src/client/locales.ts', 'utf8')
const officialCordisName = /presetCordisName: '创造模式'/.test(localesSrc)
const officialCordisDesc = localesSrc.includes('用对话定制 DSH')
const officialStandardDesc = localesSrc.includes('处理代码、文件和资料')
const hasPresetDisplay = /export function presetDisplay\b/.test(labelsSrc)
const menuUsesDisplay = /presetDisplay\(option/.test(chipSrc)
console.log('cordis display name is 创造模式: ' + (officialCordisName ? 'OK' : 'FAIL'))
console.log('cordis intro matches official copy: ' + (officialCordisDesc ? 'OK' : 'FAIL'))
console.log('standard intro matches official copy: ' + (officialStandardDesc ? 'OK' : 'FAIL'))
console.log('presetDisplay helper exists: ' + (hasPresetDisplay ? 'OK' : 'FAIL'))
console.log('menu uses presetDisplay for the intro line: ' + (menuUsesDisplay ? 'OK' : 'FAIL'))

const dialogPath = 'src/client/agent-preset/PresetGuideDialog.tsx'
const hasDialogFile = existsSync(dialogPath)
const dialogSrc = hasDialogFile ? readFileSync(dialogPath, 'utf8') : ''
const usesSystemModal = dialogSrc.includes("from '@deepseek-ai/dsh-client-ui-primitives'")
  && /\bModal\b/.test(dialogSrc)
const usesSystemTabs = /\bSegmentedTabs\b/.test(dialogSrc)
const chipHasHelp = /modeExplanation/.test(chipSrc) && /howToUse/.test(chipSrc)
  && /presetGuide\(/.test(chipSrc)
const localesHaveHelp = /modeExplanation: '模式说明'/.test(localesSrc)
  && /howToUse: '如何使用'/.test(localesSrc)
console.log('guide dialog uses system Modal: ' + (usesSystemModal ? 'OK' : 'FAIL'))
console.log('guide dialog uses SegmentedTabs: ' + (usesSystemTabs ? 'OK' : 'FAIL'))
console.log('chip offers 模式说明 / 如何使用: ' + (chipHasHelp ? 'OK' : 'FAIL'))
console.log('locales include the help actions: ' + (localesHaveHelp ? 'OK' : 'FAIL'))
const modesSeparated = /data-workspace-git-preset-row\]:not\(:last-child\)/.test(chipSrc)
  && /border-bottom: 0\.5px solid var\(--dsw-alias-border-l2\)/.test(chipSrc)
const menuNarrower = /max-width: 330px !important/.test(chipSrc)
const helpAligns = /padding: '0 8px 8px'/.test(chipSrc)
const dialogFixedWidth = /width: 600px/.test(dialogSrc)
console.log('modes are separated by an underline: ' + (modesSeparated ? 'OK' : 'FAIL'))
console.log('mode menu width is 330px: ' + (menuNarrower ? 'OK' : 'FAIL'))
console.log('help actions align with the mode name: ' + (helpAligns ? 'OK' : 'FAIL'))
console.log('guide dialog width is 600px: ' + (dialogFixedWidth ? 'OK' : 'FAIL'))
const chipBorderless = /border: 'none'/.test(chipSrc)
  && !/border: '0\.5px solid var\(--dsw-alias-border-l3\)'/.test(chipSrc)
const menuWhite = /listClassName=\{MENU_LIST_CLASS\}/.test(chipSrc)
  && /background: #fff !important/.test(chipSrc)
const hoverHeightMatches = /minHeight: '28px'/.test(chipSrc)
  && /height: '28px'/.test(chipSrc)
  && !/height: '32px'/.test(chipSrc)
console.log('mode chip trigger has no border: ' + (chipBorderless ? 'OK' : 'FAIL'))
console.log('mode menu background is white: ' + (menuWhite ? 'OK' : 'FAIL'))
console.log('mode chip hover height matches workspace (28px): ' + (hoverHeightMatches ? 'OK' : 'FAIL'))
const menuWraps = /overflowWrap: 'anywhere'/.test(chipSrc)
  && /white-space: normal/.test(chipSrc)
  && /max-height: none !important/.test(chipSrc)
  && /min-height: 0 !important/.test(chipSrc)
const selectedTag = /selectedTag/.test(chipSrc)
  && /data-workspace-git-preset-selected/.test(chipSrc)
  && /selectedTag: '已选择'/.test(localesSrc)
  && /\bTag\b/.test(chipSrc)
console.log('mode menu text wraps with unbounded row height: ' + (menuWraps ? 'OK' : 'FAIL'))
console.log('selected mode shows 已选择 tag: ' + (selectedTag ? 'OK' : 'FAIL'))
const titleBold = /fontWeight: 600/.test(chipSrc)
const rowHover = /\[data-workspace-git-preset-row\]:hover/.test(chipSrc)
  && /color-mix\(in srgb, var\(--dsw-alias-interactive-bg-hover\) 40%, #fff\)/.test(chipSrc)
  && /\[role="menuitem"\]:hover:not\(:disabled\)/.test(chipSrc)
console.log('mode title is bold: ' + (titleBold ? 'OK' : 'FAIL'))
console.log('mode row hover covers help and is paler: ' + (rowHover ? 'OK' : 'FAIL'))

// The header label defers on the same signal (the official label is ungated and
// already showing whenever Developer tools is on).
const labelStore = label.options.inject().store
await labelStore.load('cordis')
const labelArgs = { sessionId: 's1', t, store: labelStore,
  useSessions: (sel) => sel({ byId: { s1: { projectionValues: { agentPreset: 'cordis' } } } }) }
const labelOn = renderToStaticMarkup(React.createElement(label.component, { ...labelArgs, developerTools: onSource }))
const labelOff = renderToStaticMarkup(React.createElement(label.component, { ...labelArgs, developerTools: offSource }))
const labelDefers = labelOn === ''
const labelShows = labelOff.includes('data-workspace-git-agent-preset-label')
console.log('header label: Developer tools ON -> defers: ' + (labelDefers ? 'OK' : 'FAIL -> ' + labelOn.slice(0, 60)))
console.log('header label: Developer tools OFF -> renders: ' + (labelShows ? 'OK' : 'FAIL'))


// --- Prompt enhancer -------------------------------------------------------
// The seat must exist, must NOT declare its own inject (uiSession publishes
// `useInput`/`inputActions` into the session scope; a same-named prop here
// would be the duplicate-prop throw), and must render only when the composer
// face is actually present.
const enhancer = registrations.find((r) => r.options.id === 'workspace-git-prompt-enhance')
// The enhancer must sit in the TRAILING cluster (input.right), not beside the
// branch pill (input.left): input.left and the model selector are separate
// containers, so the rightmost occupant of input.left is a whole cluster away
// from the picker. `order` cannot bridge that — only the seat can.
const enhancerOk = enhancer !== undefined && enhancer.options.name === 'conversation.input.right'
console.log('\nenhancer seat registered in input.right: ' + (enhancerOk ? 'OK' : 'FAIL'))
// No `order`: the seat has one occupant, and a number would be a guess about
// how to rank against a future registrant rather than a decision of ours.
const noOrder = enhancer !== undefined && enhancer.options.order === undefined
console.log('enhancer registers no order (seat decides placement): ' + (noOrder ? 'OK' : 'FAIL'))
// It must NOT still be in input.left, which the branch pill keeps.
const notInLeft = enhancer !== undefined
  && !registrations.some((r) => r.options.id === 'workspace-git-prompt-enhance' && r.options.name === 'conversation.input.left')
console.log('enhancer no longer occupies input.left: ' + (notInLeft ? 'OK' : 'FAIL'))
const injectIsSessionFactory = enhancer !== undefined && typeof enhancer.options.inject === 'function'
const injectedProps = injectIsSessionFactory ? enhancer.options.inject('sess-42') : undefined
const sessionIdFlows = injectedProps?.sessionId === 'sess-42'
console.log('enhancer inject is a sessionId factory: ' + (injectIsSessionFactory ? 'OK' : 'FAIL'))
console.log('enhancer receives the session id: ' + (sessionIdFlows ? 'OK' : 'FAIL -> ' + JSON.stringify(injectedProps)))

const enhancerStubT = (key) => `${key}`
// A composer face like ui-conversation publishes: a selector hook + setDraft.
let drafts = []
const makeInput = (value) => (selector) => selector({ draft: value, phase: 'idle' })
const actions = { setDraft: (text) => { drafts.push(text) } }

const withFace = renderToStaticMarkup(React.createElement(enhancer.component, {
  sessionId: 'sess-1', t: enhancerStubT, useInput: makeInput('hello'), inputActions: actions,
}))
const renders = withFace.includes('data-workspace-git-prompt-enhance')
console.log('enhancer renders with a composer face: ' + (renders ? 'OK' : 'FAIL'))

// Without the face it must render NOTHING rather than a dead button.
const noFace = renderToStaticMarkup(React.createElement(enhancer.component, {
  sessionId: 'sess-1', t: enhancerStubT, useInput: makeInput('hello'),
}))
console.log('enhancer renders nothing without inputActions: ' + (noFace === '' ? 'OK' : 'FAIL -> ' + noFace.slice(0, 60)))

// Empty draft: the button is disabled, so a click cannot fire a request.
const emptyFace = renderToStaticMarkup(React.createElement(enhancer.component, {
  sessionId: 'sess-1', t: enhancerStubT, useInput: makeInput('   '), inputActions: actions,
}))
const disabledOnEmpty = emptyFace.includes('disabled')
console.log('enhancer disabled on an empty draft: ' + (disabledOnEmpty ? 'OK' : 'FAIL'))

// Idle vs busy must be distinguishable in the markup: the button swaps the
// glyph for a spinner while a request is in flight. `busy` is internal state
// and there is no DOM here to click, so the idle half is asserted on the
// rendered output and the busy half on the bundle's own swap expression.
const idleIsGlyph = withFace.includes('data-icon="prompt-enhance"')
const idleHasNoSpinner = !withFace.includes('prompt-enhance-spinner')
console.log('idle renders the glyph: ' + (idleIsGlyph ? 'OK' : 'FAIL'))
console.log('idle renders no spinner: ' + (idleHasNoSpinner ? 'OK' : 'FAIL'))
// `bundleSource` is read above, next to the `blank`-guard assertions.
// Scoped to the enhancer's own slice: other components in this bundle also
// mention spinners and hover handlers, and a file-wide search matches those.
const enhancerStart = bundleSource.indexOf('data-workspace-git-prompt-enhance')
const enhancerEnd = bundleSource.indexOf('toast === null', enhancerStart)
const enhancerCode = enhancerStart === -1
  ? ''
  : bundleSource.slice(enhancerStart, enhancerEnd === -1 ? undefined : enhancerEnd)
const spinnerSwappedIn = /busy \? [\s\S]{0,80}EnhanceSpinner/u.test(enhancerCode)
console.log('busy swaps in the spinner: ' + (spinnerSwappedIn ? 'OK' : 'FAIL'))
// The spinner must actually animate, and must hold still under reduced motion.
const spinnerAnimates = bundleSource.includes('dsw-enhance-spin') && bundleSource.includes('rotate(360deg)')
const spinnerReduced = bundleSource.includes('prefers-reduced-motion')
console.log('spinner rotates: ' + (spinnerAnimates ? 'OK' : 'FAIL'))
console.log('spinner honors prefers-reduced-motion: ' + (spinnerReduced ? 'OK' : 'FAIL'))
// The button exposes its state, so the swap is observable from outside.
const exposesState = withFace.includes('data-enhance-state="idle"')
console.log('button exposes data-enhance-state: ' + (exposesState ? 'OK' : 'FAIL'))

// Hover tint must match the branch pill beside it, and must carry a literal
// fallback: a bare `var(--token)` with no fallback resolves to TRANSPARENT when
// the token is undefined, which would silently make hover do nothing.
//
// These read the enhancer's OWN slice of the bundle, not the whole file: other
// components here (GitGraphDialog's close button) also carry onMouseEnter /
// onMouseLeave, and a file-wide search matches those first. `enhancerCode` is
// defined above, next to the bundle read.
const hoverTints = enhancerCode.includes('interactive-bg-hover')
const hoverHasFallback = /interactive-bg-hover,\s*#f1f1f1/u.test(enhancerCode)
const hoverResets = /onMouseLeave[\s\S]{0,200}background = "transparent"/u.test(enhancerCode)
// A disabled control must not tint on hover — a hover chip on an unpressable
// button reads as "go ahead".
const hoverGuardsDisabled = /onMouseEnter[\s\S]{0,200}busy \|\| submitting \|\| empty\) return/u.test(enhancerCode)
console.log('enhancer slice located in bundle: ' + (enhancerCode === '' ? 'FAIL' : 'OK'))
console.log('hover uses the shared interactive token: ' + (hoverTints ? 'OK' : 'FAIL'))
console.log('hover has a literal fallback: ' + (hoverHasFallback ? 'OK' : 'FAIL'))
console.log('mouseleave resets the background: ' + (hoverResets ? 'OK' : 'FAIL'))
console.log('hover skips while disabled: ' + (hoverGuardsDisabled ? 'OK' : 'FAIL'))

// The hover chip is a CIRCLE, matching the round button shape. Asserted on the
// rendered idle button: the geometry lives in the base style, so a round
// hover needs no per-state change in the mouse handlers.
const roundBase = /border-radius:\s*999px/.test(withFace)
const notRounded = !/border-radius:\s*8px/.test(withFace)
console.log('button is fully round: ' + (roundBase ? 'OK' : 'FAIL'))
console.log('button is not a rounded square: ' + (notRounded ? 'OK' : 'FAIL'))
// And the handlers must not mutate the shape — a per-state borderRadius would
// make the corner visibly morph as the pointer crosses the edge. Scoped to the
// two handler bodies: `borderRadius` legitimately appears in the base `style`
// block just below them, which a wider window would wrongly match.
const enterBody = /onMouseEnter: \(e\) => \{[\s\S]{0,400}?\n\t*\}/u.exec(enhancerCode)
const leaveBody = /onMouseLeave: \(e\) => \{[\s\S]{0,400}?\n\t*\}/u.exec(enhancerCode)
const hoverTouchesShape = [...(enterBody ? [enterBody[0]] : []), ...(leaveBody ? [leaveBody[0]] : [])]
  .some((body) => /borderRadius|border-radius/u.test(body))
console.log('hover handlers found in bundle: ' + (enterBody && leaveBody ? 'OK' : 'FAIL'))
console.log('hover handlers leave the shape alone: ' + (!hoverTouchesShape ? 'OK' : 'FAIL'))

const allOk = ok && emptyOk && noThrow && mineWins && showsWhenOn && shows && labelDefers && labelShows
  && enhancerOk && injectIsSessionFactory && sessionIdFlows && renders && (noFace === '') && disabledOnEmpty
  && idleIsGlyph && idleHasNoSpinner && spinnerSwappedIn && spinnerAnimates && spinnerReduced && exposesState
  && hoverTints && hoverHasFallback && hoverResets && hoverGuardsDisabled
  && noOrder && notInLeft && roundBase && notRounded && !hoverTouchesShape
  && blankSwitchable && runningLocked && absentLocked && undefinedLocked && lockedExplained && stillRenders
  && guardsOnBlank && locksOnBlank
  && officialCordisName && officialCordisDesc && officialStandardDesc && hasPresetDisplay && menuUsesDisplay
  && usesSystemModal && usesSystemTabs && chipHasHelp && localesHaveHelp
  && modesSeparated && menuNarrower && helpAligns && dialogFixedWidth
  && chipBorderless && menuWhite && hoverHeightMatches
  && menuWraps && selectedTag && titleBold && rowHover
console.log('\n' + (allOk ? 'MOUNT TEST PASSED' : 'MOUNT TEST FAILED'))
process.exit(allOk ? 0 : 1)
