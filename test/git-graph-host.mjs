/**
 * End-to-end host checks for the commit-graph filter support, driven through
 * the plugin's REAL HTTP routes against a real temporary repository.
 *
 * Going through the route rather than calling the helpers directly is the point:
 * it exercises request parsing, the pagination contract, and the trust fence,
 * and it is the same path the browser takes. The `tips` method gets this
 * treatment because it is what makes branch filtering correct under pagination —
 * `git log --decorate` names a ref only on the commit it points at, so a later
 * page decorates no branch at all.
 *
 * Usage: node test/git-graph-host.mjs <baseUrl>
 *   e.g. node test/git-graph-host.mjs http://127.0.0.1:19520
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const baseUrl = process.argv[2]
if (!baseUrl) {
  console.error('usage: node test/git-graph-host.mjs <baseUrl>')
  process.exit(2)
}

let ok = 0
const check = async (label, fn) => {
  try { await fn(); ok += 1; console.log('ok  ' + label) }
  catch (e) { console.log('FAIL ' + label + '\n     ' + (e?.message ?? e)); process.exitCode = 1 }
}

/** POST one plugin method and unwrap the envelope. */
async function call(method, body) {
  const res = await fetch(`${baseUrl}/workspace-git/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (json?.ok !== true) throw new Error(`${method} failed: ${JSON.stringify(json?.error ?? json)}`)
  return json.value
}

const repo = mkdtempSync(join(tmpdir(), 'git-graph-filter-'))
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
const commit = (file, message) => {
  writeFileSync(join(repo, file), message + '\n')
  git('add', '.')
  git('commit', '-qm', message)
}

try {
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')

  commit('a.txt', 'A: base')
  git('checkout', '-qb', 'feature')
  commit('f1.txt', 'F1: feature work')
  commit('f2.txt', 'F2: more feature')
  git('checkout', '-q', 'main')
  commit('m1.txt', 'M1: main work')
  git('checkout', '-qb', 'release')
  commit('r1.txt', 'R1: release prep')
  git('checkout', '-q', 'main')
  commit('m2.txt', 'M2: main again')
  git('merge', '-q', '--no-ff', 'feature', '-m', 'M3: merge feature into main')
  git('tag', 'v1.0')
  git('checkout', '-q', 'release')
  git('merge', '-q', '--no-ff', 'main', '-m', 'R2: merge main into release')
  git('checkout', '-q', 'main')

  // --- the tips route ------------------------------------------------------
  await check('the tips route returns every branch tip', async () => {
    const { tips } = await call('tips', { path: repo })
    assert.equal(tips.main, git('rev-parse', 'main').trim())
    assert.equal(tips.feature, git('rev-parse', 'feature').trim())
    assert.equal(tips.release, git('rev-parse', 'release').trim())
    assert.equal(tips['v1.0'], git('rev-parse', 'v1.0').trim())
  })

  await check('the tips route omits origin/HEAD', async () => {
    const { tips } = await call('tips', { path: repo })
    assert.ok(!Object.keys(tips).some(name => name.endsWith('/HEAD')))
  })

  await check('the tips route rejects a relative path', async () => {
    const res = await fetch(`${baseUrl}/workspace-git/api/tips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'relative/path' }),
    })
    const json = await res.json()
    assert.equal(json.ok, false)
    assert.equal(json.error.code, 'bad-request')
  })

  await check('the tips route answers {} for a non-repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'not-a-repo-'))
    try {
      const { tips } = await call('tips', { path: plain })
      assert.deepEqual(tips, {})
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })

  // --- pagination ----------------------------------------------------------
  await check('the graph pages without dropping commits', async () => {
    const full = await call('graph', { path: repo, maxCount: 200, skip: 0 })
    const p1 = await call('graph', { path: repo, maxCount: 4, skip: 0 })
    const p2 = await call('graph', { path: repo, maxCount: 4, skip: 4 })
    assert.equal(full.commits.length, 8, `expected 8 commits, got ${full.commits.length}`)
    assert.equal(p1.commits.length, 4)
    assert.equal(p1.hasMore, true)
    // Accumulating pages must reproduce the history exactly: this is what makes
    // client-side filtering stable as more pages arrive.
    assert.deepEqual([...p1.commits, ...p2.commits].map(c => c.hash), full.commits.map(c => c.hash))
  })

  await check('a later page decorates no branch, yet tips still resolve them', async () => {
    const p2 = await call('graph', { path: repo, maxCount: 3, skip: 3 })
    const { tips } = await call('tips', { path: repo })
    const decorated = p2.commits.flatMap(c => c.refs).filter(r => r.kind === 'branch' || r.kind === 'remote')
    console.log(`     page-2 branch decorations: ${decorated.length}`)
    // This is the failure the tips route prevents: without it, a branch filter
    // applied while only this page is loaded would find no root.
    assert.equal(decorated.length, 0, 'precondition: page 2 decorates no branch')
    assert.ok(tips.main && tips.feature && tips.release, 'tips must still resolve every branch')
  })

  // --- topology the filter relies on --------------------------------------
  await check('merge commits report both parents', async () => {
    const full = await call('graph', { path: repo, maxCount: 200, skip: 0 })
    const merges = full.commits.filter(c => c.parents.length > 1)
    assert.equal(merges.length, 2, `expected 2 merges, got ${merges.length}`)
  })

  await check('refs are classified by kind, including the tag and HEAD', async () => {
    const full = await call('graph', { path: repo, maxCount: 200, skip: 0 })
    const kinds = new Set(full.commits.flatMap(c => c.refs.map(r => r.kind)))
    assert.ok(kinds.has('branch'), 'a local branch ref must be classified as branch')
    assert.ok(kinds.has('tag'), 'a tag ref must be classified as tag')
    assert.ok(kinds.has('head'), 'HEAD must be present')
  })

  await check('a non-repository yields an empty graph, not an error', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'not-a-repo-'))
    try {
      const out = await call('graph', { path: plain, maxCount: 10, skip: 0 })
      assert.deepEqual(out.commits, [])
      assert.equal(out.hasMore, false)
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
} finally {
  rmSync(repo, { recursive: true, force: true })
}

console.log(`\n${ok} host graph checks passed`)
