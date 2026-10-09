/**
 * The commit-body stylesheet must MATCH the DOM it targets.
 *
 * This test exists because an earlier revision of `commitBodyStyles.ts` shipped
 * a scope of `[attr] [attr] *` — a selector that parses, looks correctly
 * scoped, and can never match, because the attribute sits on exactly one
 * element. The panel then rendered at the Markdown default (14px prose, 21px
 * headings) while the stylesheet silently did nothing.
 *
 * So the assertions here are about MATCHING, not about parsing or about the
 * presence of `!important`. The rendered shape the panel produces is:
 *
 *   <div data-workspace-git-commit-body>          <- our wrapper
 *     <div class="<hashed>">                      <- MarkdownText root
 *       <p>…<code>inline</code></p>
 *       <h1>heading</h1>
 *       <pre><code>block</code></pre>
 *     </div>
 *   </div>
 *
 * The root class is HASHED by the shell's bundler and is not knowable here, so
 * the fake deliberately uses a hash-looking name: any rule that depended on the
 * literal class `markdown` fails this test, which is the point.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'dsh-commit-body-test-'))
try {
  execFileSync('npx', ['tsc', 'src/client/git-graph/commitBodyStyles.ts',
    '--outDir', dir, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--declaration', 'false',
  ], { stdio: 'pipe' })
} catch (error) {
  console.error(String(error.stdout ?? '') + String(error.stderr ?? ''))
  throw error
}

const mod = await import(join(dir, 'commitBodyStyles.js'))
const { COMMIT_BODY_SELECTOR_PROBES } = mod

const results = []
const check = (name, passed, detail) => {
  results.push({ name, passed })
  console.log(`${passed ? 'OK  ' : 'FAIL'} ${name}${detail === undefined || passed ? '' : ' -> ' + detail}`)
}

// --- The rendered shape ------------------------------------------------------
// HASHED root class on purpose: a rule that named `.markdown` literally would
// not match a real build, so it must not match here either.
const ATTR = 'data-workspace-git-commit-body'
const tree = {
  tag: 'div', attrs: { [ATTR]: '' }, classes: [], children: [
    { tag: 'div', attrs: {}, classes: ['NkM3Kq_markdown'], children: [
      { tag: 'p', attrs: {}, classes: [], children: [
        { tag: 'code', attrs: {}, classes: [], children: [] },
      ] },
      { tag: 'h1', attrs: {}, classes: [], children: [] },
      { tag: 'pre', attrs: {}, classes: [], children: [
        { tag: 'code', attrs: {}, classes: [], children: [] },
      ] },
      { tag: 'table', attrs: {}, classes: [], children: [
        { tag: 'td', attrs: {}, classes: [], children: [] },
      ] },
      { tag: 'span', attrs: {}, classes: ['katex'], children: [] },
    ] },
  ],
}

/** Flatten with ancestor chains, so descendant matching is possible. */
function flatten(node, ancestors = []) {
  const chain = [...ancestors, node]
  return [chain, ...node.children.flatMap((child) => flatten(child, chain))]
}
const nodes = flatten(tree)

/**
 * Match ONE simple compound (no combinators) against one ancestor chain.
 * Supports `tag`, `.class`, `[attr]`, and `:where(...)` (zero specificity, so
 * it is unwrapped to its argument list). Enough for the probes used here.
 */
function matchCompound(compound, chain) {
  let target = chain[chain.length - 1]
  let spec = compound.trim()
  if (spec === '*') return true

  // Tag / universal at the head.
  const tagMatch = spec.match(/^[a-z][\w-]*/)
  if (tagMatch !== null) {
    if (target.tag !== tagMatch[0]) return false
    spec = spec.slice(tagMatch[0].length)
  }

  // Expand a single :where(...) into one of its alternatives.
  const where = spec.match(/:where\(([^)]*)\)/)
  if (where !== null) {
    const alts = where[1].split(',').map((s) => s.trim())
    const rest = spec.replace(where[0], '')
    return alts.some((alt) => matchCompound(`${alt}${rest}`, chain))
  }

  // Remaining simple selectors.
  const parts = spec.match(/\[[^\]]+\]|\.[\w-]+/g) ?? []
  for (const part of parts) {
    if (part.startsWith('[')) {
      const attr = part.slice(1, -1).replace(/[~|^$*]?=.*$/, '')
      if (!(attr in target.attrs)) return false
    } else {
      const cls = part.slice(1)
      if (!target.classes.includes(cls)) return false
    }
  }
  return true
}

/** Split a selector into compound tokens on combinators, ignoring whitespace
 * INSIDE parentheses. A naive `split(/\s+/)` breaks `:where(h1, h2, h3)` into
 * three tokens at the comma spaces, which is what a first pass of this test
 * did — reporting a false failure for a perfectly valid selector. */
function tokenize(selector) {
  const tokens = []
  let depth = 0
  let current = ''
  for (const ch of selector.trim()) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (depth === 0 && /\s/.test(ch)) {
      if (current !== '') { tokens.push(current); current = '' }
      continue
    }
    current += ch
  }
  if (current !== '') tokens.push(current)
  return tokens
}

/** Match a full selector (descendant/child combinators) against a chain. */
function matches(selector, chain) {
  const tokens = tokenize(selector)
  const parts = []
  for (const token of tokens) {
    if (token === '>') { parts.push({ child: true, sel: null }); continue }
    if (parts.length > 0 && parts[parts.length - 1].sel === null) {
      parts[parts.length - 1].sel = token
    } else {
      parts.push({ child: false, sel: token })
    }
  }
  // Walk right-to-left.
  let index = chain.length - 1
  for (let p = parts.length - 1; p >= 0; p--) {
    const part = parts[p]
    if (!matchCompound(part.sel, chain.slice(0, index + 1))) return false
    if (p === 0) return true
    if (part.child) {
      index -= 1
      if (index < 0) return false
      continue
    }
    // Descendant: find the nearest ancestor that matches the PREVIOUS part.
    const prev = parts[p - 1]
    let found = -1
    for (let a = index - 1; a >= 0; a--) {
      if (matchCompound(prev.sel, chain.slice(0, a + 1))) { found = a; break }
    }
    if (found < 0) return false
    index = found
    p -= 1
  }
  return true
}

// --- Assertions --------------------------------------------------------------
console.log('selector probes:', COMMIT_BODY_SELECTOR_PROBES.length)
check('probes exported', Array.isArray(COMMIT_BODY_SELECTOR_PROBES) && COMMIT_BODY_SELECTOR_PROBES.length > 0)

// Every probe must match at least one node in the REAL shape. A probe that
// matches nothing is the dead-stylesheet bug.
for (const selector of COMMIT_BODY_SELECTOR_PROBES) {
  const hit = nodes.some((chain) => matches(selector, chain))
  check(`matches the rendered DOM: ${selector}`, hit)
}

// The universal descendant rule must reach an element nested two levels down
// (the inline <code>), which is where the upstream !important lives.
const SCOPE = `[${ATTR}]`
const codeChain = nodes.find((chain) => chain[chain.length - 1].tag === 'code'
  && chain.some((n) => n.tag === 'p'))
check('universal rule reaches nested inline <code>',
  matches(`${SCOPE} *`, codeChain))

// And it must reach block code inside <pre>.
const preCodeChain = nodes.find((chain) => chain[chain.length - 1].tag === 'code'
  && chain.some((n) => n.tag === 'pre'))
check('universal rule reaches <pre><code>',
  matches(`${SCOPE} *`, preCodeChain))

// A selector naming the literal (unhashed) class must NOT match: this is the
// trap the earlier `.markdown` design would have fallen into.
check('a literal .markdown selector does NOT match the hashed root',
  !nodes.some((chain) => matches(`${SCOPE} .markdown`, chain)))

// Nothing may match outside the wrapper: an unscoped rule is a leak.
const outside = { tag: 'div', attrs: {}, classes: [], children: [] }
const outsideNodes = [[outside]]
for (const selector of COMMIT_BODY_SELECTOR_PROBES) {
  const leaked = outsideNodes.some((chain) => matches(selector, chain))
  check(`does not match outside the wrapper: ${selector}`, !leaked)
}

// --- The real DOM the panel builds -------------------------------------------
// Read the component source to confirm the attribute and the MarkdownText child
// are still wired together: the selectors above are only correct if the panel
// actually renders this shape.
const component = await import('node:fs').then((fs) =>
  fs.readFileSync('src/client/git-graph/GitGraphDetailPanel.tsx', 'utf8'))
check('panel renders the scope attribute exactly once',
  (component.match(/data-workspace-git-commit-body/g) ?? []).length === 1)
check('panel calls ensureCommitBodyStyles on mount',
  /ensureCommitBodyStyles\(\)/.test(component))
check('scope attribute is on the MarkdownText wrapper',
  /data-workspace-git-commit-body=""[\s\S]{0,200}<MarkdownText/.test(component))

const failed = results.filter((r) => !r.passed)
console.log(`\n${failed.length === 0 ? 'COMMIT BODY STYLES PASSED' : `${failed.length} FAILED`} (${results.length - failed.length}/${results.length})`)
rmSync(dir, { recursive: true, force: true })
process.exit(failed.length === 0 ? 0 : 1)
