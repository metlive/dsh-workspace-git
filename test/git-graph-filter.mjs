/**
 * Filter-logic checks for the commit graph.
 *
 * Two properties carry the feature:
 *
 * - **Reachability.** Selecting a branch must show that branch's history —
 *   ancestors and merged work included — not just the commits carrying its ref.
 *   Getting this wrong is the difference between "feature looked empty" and a
 *   correct graph.
 * - **No residual geometry.** A filtered subset must relayout cleanly: no path
 *   may name a commit that is no longer displayed, and no coordinate may be
 *   NaN. That is what "no leftover lines or misalignment" means concretely, and
 *   it is checked against the REAL layout function, not a stand-in.
 *
 * The topology below is a genuine multi-lane one (a branch, a merge, and a
 * branch off a branch) because a linear history cannot expose a lane bug.
 */
import assert from 'node:assert/strict'
import {
  EMPTY_FILTER,
  collectFacets,
  filterCommits,
  isFacetSelected,
  isFilterActive,
  branchTipHashes,
  reachableFrom,
  selectedCount,
  toggleFacet,
} from '../src/client/git-graph/filter.ts'
import { layoutGitGraph } from '../src/client/git-graph/layout.ts'

let ok = 0
const check = (label, fn) => {
  try { fn(); ok += 1; console.log('ok  ' + label) }
  catch (e) { console.log('FAIL ' + label + '\n     ' + (e.stack ?? e.message).split('\n').slice(0, 3).join('\n     ')); process.exitCode = 1 }
}

/**
 * A topology with real lanes, and branch names that are NOT commit hashes —
 * they were distinct in the first draft, which made a "missing branch" bug look
 * like a fixture typo. Branch names are spelled out (`main`, `feature`,
 * `release`) and each is decorated on its own tip commit, as git does.
 *
 *   R2 (release) ── merge of M3
 *   M3 (main)    ── merge of F2
 *   F2 (feature)
 *   F1 (feature)
 *   M2 (main)
 *   R1 (release)
 *   M1 (main)
 *   A  (base, also tagged v0.9)
 */
const c = (hash, parents, refs, author = 'Ada') => ({
  hash, parents, refs, subject: hash, authorName: author, authoredAtMs: null,
})
const COMMITS = [
  c('R2', ['M3', 'R1'], [{ name: 'release', kind: 'branch' }, { name: 'HEAD', kind: 'head' }], 'Bo'),
  c('M3', ['F2', 'M2'], [{ name: 'main', kind: 'branch' }]),
  c('F2', ['F1'], [{ name: 'feature', kind: 'branch' }]),
  c('F1', ['A'], []),
  c('M2', ['M1'], [{ name: 'origin/main', kind: 'remote' }], 'Bo'),
  c('R1', ['M1'], []),
  c('M1', ['A'], [{ name: 'v1', kind: 'tag' }]),
  c('A', [], [{ name: 'v0.9', kind: 'tag' }], 'Cy'),
]

/** The host's `for-each-ref` map for this fixture: what a real repo would return. */
const TIPS = { main: 'M3', feature: 'F2', release: 'R2', 'origin/main': 'M2', v1: 'M1', 'v0.9': 'A' }

const byName = (commits) => commits.map(x => x.hash)

// --- facets --------------------------------------------------------------
check('collectFacets finds branches, remotes, tags, and authors', () => {
  const facets = collectFacets(COMMITS)
  const ids = facets.map(f => f.id)
  assert.ok(ids.includes('branch:main'))
  assert.ok(ids.includes('branch:feature'))
  assert.ok(ids.includes('branch:release'))
  assert.ok(ids.includes('remote:origin/main'))
  assert.ok(ids.includes('tag:v1'))
  assert.ok(ids.includes('tag:v0.9'))
  assert.ok(ids.includes('author:Ada'))
  assert.ok(ids.includes('author:Bo'))
  assert.ok(ids.includes('author:Cy'))
})

check('HEAD is not offered as a facet', () => {
  const facets = collectFacets(COMMITS)
  assert.ok(!facets.some(f => f.id.includes('HEAD')), 'HEAD must not be selectable')
})

check('facets are ordered branch → remote → tag → author, alphabetical', () => {
  const kinds = collectFacets(COMMITS).map(f => f.kind)
  const order = { branch: 0, remote: 1, tag: 2, author: 3 }
  const sorted = [...kinds].sort((a, b) => order[a] - order[b])
  assert.deepEqual(kinds, sorted)
  const branches = collectFacets(COMMITS).filter(f => f.kind === 'branch').map(f => f.label)
  assert.deepEqual(branches, ['feature', 'main', 'release'])
})

check('facet counts reflect how many commits carry the value', () => {
  const facets = collectFacets(COMMITS)
  assert.equal(facets.find(f => f.id === 'author:Ada').count, 5)
  assert.equal(facets.find(f => f.id === 'author:Bo').count, 2)
  assert.equal(facets.find(f => f.id === 'author:Cy').count, 1)
})

// --- reachability --------------------------------------------------------
check('reachableFrom walks parents to the root', () => {
  const r = reachableFrom(COMMITS, ['F2'])
  assert.deepEqual([...r].sort(), ['A', 'F1', 'F2'])
})

check('reachableFrom follows merges into both sides', () => {
  const r = reachableFrom(COMMITS, ['M3'])
  assert.deepEqual([...r].sort(), ['A', 'F1', 'F2', 'M1', 'M2', 'M3'])
})

check('reachableFrom from multiple roots unions the sets', () => {
  const r = reachableFrom(COMMITS, ['F2', 'R1'])
  assert.deepEqual([...r].sort(), ['A', 'F1', 'F2', 'M1', 'R1'])
})

check('reachableFrom terminates on a cycle', () => {
  // Not valid git, but a malformed page must not hang the UI.
  const cyclic = [c('X', ['Y'], []), c('Y', ['X'], [])]
  const r = reachableFrom(cyclic, ['X'])
  assert.deepEqual([...r].sort(), ['X', 'Y'])
})

check('reachableFrom stops at the page boundary without failing', () => {
  // P is a parent that is not in this page. The walk records P but cannot
  // continue past it — which is the point: it must not treat "outside the page"
  // as "unreachable", and it must not throw.
  const page = [c('Q', ['P'], [])]
  const r = reachableFrom(page, ['Q'])
  assert.ok(r.has('Q'), 'the root must be reachable')
  assert.equal(r.size, 2, 'the off-page parent is recorded but not expanded')
  assert.deepEqual([...r].sort(), ['P', 'Q'])
})

// --- filtering semantics -------------------------------------------------
check('an inactive filter returns the SAME array (no needless relayout)', () => {
  const out = filterCommits(COMMITS, EMPTY_FILTER, TIPS)
  assert.equal(out, COMMITS, 'identity must be preserved for the pane memo')
})

check('selecting a branch shows its reachable history', () => {
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['feature'] }, TIPS)
  assert.deepEqual(byName(out), ['F2', 'F1', 'A'])
})

check('selecting main includes work merged in from feature', () => {
  // This is the case that separates reachability from ref membership: F1/F2 do
  // not carry a `main` ref, yet they ARE main's history.
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['main'] }, TIPS)
  assert.deepEqual(byName(out), ['M3', 'F2', 'F1', 'M2', 'M1', 'A'])
})

check('selecting release includes everything merged into it', () => {
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['release'] }, TIPS)
  assert.deepEqual(byName(out), ['R2', 'M3', 'F2', 'F1', 'M2', 'R1', 'M1', 'A'])
})

check('selecting several branches unions their histories', () => {
  // feature → {F2, F1, A}; origin/main → {M2, M1, A}. The union is those six minus
  // the duplicated A, in the original commit order.
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['feature', 'origin/main'] }, TIPS)
  assert.deepEqual(byName(out), ['F2', 'F1', 'M2', 'M1', 'A'])
})

check('a local and a remote branch of the same line can be selected together', () => {
  // Both spellings live in `branches`; selecting them unions their reachable
  // sets rather than intersecting, so nothing is lost.
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['main', 'origin/main'] }, TIPS)
  assert.deepEqual(byName(out), ['M3', 'F2', 'F1', 'M2', 'M1', 'A'])
})

check('a remote branch is selectable and filters the same way', () => {
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['origin/main'] }, TIPS)
  assert.deepEqual(byName(out), ['M2', 'M1', 'A'])
})

check('an unknown branch name filters to nothing rather than showing all', () => {
  // Failing OPEN here would be the dangerous default: a stale selection would
  // silently display everything as though no filter were applied.
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['nope'] }, TIPS)
  assert.deepEqual(byName(out), [])
})

check('tag filtering matches only the commits carrying the tag', () => {
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, tags: ['v1'] }, TIPS)
  assert.deepEqual(byName(out), ['M1'])
})

check('author filtering matches by name', () => {
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, authors: ['Bo'] }, TIPS)
  assert.deepEqual(byName(out), ['R2', 'M2'])
})

check('dimensions combine with AND', () => {
  // Ada's commits that are also reachable from feature: F2 and F1 (A is Cy's).
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['feature'], authors: ['Ada'] }, TIPS)
  assert.deepEqual(byName(out), ['F2', 'F1'])
})

check('values within a dimension combine with OR', () => {
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, authors: ['Bo', 'Cy'] }, TIPS)
  assert.deepEqual(byName(out), ['R2', 'M2', 'A'])
})

check('filtering preserves the original commit order', () => {
  const out = filterCommits(COMMITS, { ...EMPTY_FILTER, authors: ['Ada'] }, TIPS)
  const idx = byName(out).map(h => COMMITS.findIndex(x => x.hash === h))
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
})

check('a commit with no author is excluded by an author filter, kept otherwise', () => {
  const anon = [c('Z', [], [], null)]
  assert.deepEqual(filterCommits(anon, { ...EMPTY_FILTER, authors: ['Ada'] }, TIPS).length, 0)
  assert.deepEqual(filterCommits(anon, EMPTY_FILTER, TIPS).length, 1)
})

// --- THE GEOMETRY PROPERTY ----------------------------------------------
check('a filtered subset relayouts with no dangling path', () => {
  for (const branches of [['feature'], ['main'], ['release'], ['feature', 'R1']]) {
    const subset = filterCommits(COMMITS, { ...EMPTY_FILTER, branches }, TIPS)
    const layout = layoutGitGraph(subset, { rowHeight: 30 })
    const hashes = new Set(subset.map(x => x.hash))
    const dangling = layout.paths.filter(p => p.relatedHashes.some(h => !hashes.has(h)))
    assert.equal(dangling.length, 0, `branch=${branches} produced dangling paths`)
    // Every path must be a usable SVG `d` string.
    assert.ok(layout.paths.every(p => !/NaN|undefined|Infinity/.test(p.path)),
      `branch=${branches} produced a non-finite path`)
    assert.ok(layout.rows.every(r => Number.isFinite(r.x) && Number.isFinite(r.y)))
  }
})

check('a filtered subset has exactly one row per visible commit', () => {
  for (const branches of [['feature'], ['main'], ['release']]) {
    const subset = filterCommits(COMMITS, { ...EMPTY_FILTER, branches }, TIPS)
    const layout = layoutGitGraph(subset, { rowHeight: 30 })
    assert.equal(layout.rows.length, subset.length)
    assert.deepEqual(layout.rows.map(r => r.commit.hash), subset.map(x => x.hash))
  }
})

check('the canvas shrinks to the filtered lane count', () => {
  const full = layoutGitGraph(COMMITS, { rowHeight: 30 })
  const feat = layoutGitGraph(filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['feature'] }, TIPS), { rowHeight: 30 })
  assert.ok(full.laneCount >= 3, `full graph should be multi-lane, got ${full.laneCount}`)
  assert.equal(feat.laneCount, 1, 'the feature branch is linear')
  assert.ok(feat.width < full.width, 'a narrower graph must produce a narrower canvas')
})

check('row lanes stay within the reported lane count', () => {
  for (const branches of [['feature'], ['main'], ['release']]) {
    const subset = filterCommits(COMMITS, { ...EMPTY_FILTER, branches }, TIPS)
    const layout = layoutGitGraph(subset, { rowHeight: 30 })
    for (const row of layout.rows) {
      assert.ok(row.laneIndex >= 0 && row.laneIndex < layout.laneCount,
        `lane ${row.laneIndex} outside 0..${layout.laneCount - 1}`)
    }
  }
})

check('clearing the filter restores the full graph exactly', () => {
  const filtered = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['feature'] }, TIPS)
  assert.ok(filtered.length < COMMITS.length)
  const restored = filterCommits(COMMITS, EMPTY_FILTER, TIPS)
  assert.equal(restored, COMMITS)
  assert.deepEqual(byName(restored), byName(COMMITS))
  const a = layoutGitGraph(COMMITS, { rowHeight: 30 })
  const b = layoutGitGraph(filterCommits(COMMITS, EMPTY_FILTER, TIPS), { rowHeight: 30 })
  assert.deepEqual(a.rows.map(r => [r.commit.hash, r.laneIndex, r.x, r.y]),
    b.rows.map(r => [r.commit.hash, r.laneIndex, r.x, r.y]))
  assert.equal(a.laneCount, b.laneCount)
})

// --- selection helpers ---------------------------------------------------
check('toggleFacet adds then removes a value', () => {
  const opt = { id: 'branch:main', label: 'main', kind: 'branch', count: 1 }
  const on = toggleFacet(EMPTY_FILTER, opt)
  assert.deepEqual(on.branches, ['main'])
  const off = toggleFacet(on, opt)
  assert.deepEqual(off.branches, [])
})

check('toggleFacet keeps dimensions independent', () => {
  let f = toggleFacet(EMPTY_FILTER, { id: 'branch:main', label: 'main', kind: 'branch', count: 1 })
  f = toggleFacet(f, { id: 'author:Ada', label: 'Ada', kind: 'author', count: 5 })
  f = toggleFacet(f, { id: 'tag:v1', label: 'v1', kind: 'tag', count: 1 })
  assert.deepEqual(f.branches, ['main'])
  assert.deepEqual(f.authors, ['Ada'])
  assert.deepEqual(f.tags, ['v1'])
  assert.equal(selectedCount(f), 3)
  assert.ok(isFilterActive(f))
  assert.ok(isFacetSelected(f, { id: 'branch:main', label: 'main', kind: 'branch', count: 1 }))
  assert.ok(!isFacetSelected(f, { id: 'branch:feature', label: 'feature', kind: 'branch', count: 1 }))
})

check('a remote and a local branch of the same name are distinct facets', () => {
  const local = { id: 'branch:main', label: 'main', kind: 'branch', count: 1 }
  const remote = { id: 'remote:main', label: 'main', kind: 'remote', count: 1 }
  // Both live in `branches` (they filter the same way), so selecting one selects
  // the name; the ids differ so the panel can render them in separate groups.
  assert.notEqual(local.id, remote.id)
  const f = toggleFacet(EMPTY_FILTER, local)
  assert.ok(isFacetSelected(f, remote), 'same name → same branch selection')
})

check('toggleFacet never mutates the input', () => {
  const before = { ...EMPTY_FILTER, branches: ['main'] }
  const snapshot = JSON.stringify(before)
  toggleFacet(before, { id: 'branch:x', label: 'x', kind: 'branch', count: 1 })
  assert.equal(JSON.stringify(before), snapshot)
})

// --- tip resolution across pages -----------------------------------------
// The reason the host exposes a `tips` map at all: `git log --decorate` names a
// ref only on the commit it points at, so on a later page NO branch is
// decorated. A client resolving branches from decorations alone would filter to
// an empty graph — the failure these checks exist to prevent.
check('branchTipHashes uses the host tips map', () => {
  assert.deepEqual(branchTipHashes(COMMITS, ['feature'], TIPS), ['F2'])
  assert.deepEqual(branchTipHashes(COMMITS, ['main'], TIPS), ['M3'])
})

check('an empty selection yields no tips', () => {
  assert.deepEqual(branchTipHashes(COMMITS, [], TIPS), [])
})

check('a tip outside the loaded page is not used as a walk root', () => {
  // A later page of a real repository carries no ref decorations at all.
  // Resolving the branch still yields a hash, but that hash is not in this
  // page, so it cannot root the walk.
  const page2 = COMMITS.slice(4)
  assert.deepEqual(branchTipHashes(page2, ['release'], TIPS), [],
    'an off-page tip must not root the walk')
})

check('a branch is still resolvable from a decoration when tips are absent', () => {
  // Fallback path: the tips request is in flight or failed, but the tip commit
  // happens to be loaded and decorated.
  assert.deepEqual(branchTipHashes(COMMITS, ['feature'], {}), ['F2'])
})

check('a branch unknown to both tips and decorations contributes nothing', () => {
  assert.deepEqual(branchTipHashes(COMMITS, ['ghost'], {}), [])
})

check('several branches resolve to several distinct roots', () => {
  assert.deepEqual(branchTipHashes(COMMITS, ['feature', 'origin/main'], TIPS).sort(), ['F2', 'M2'])
})

check('duplicate tips collapse to one root', () => {
  const tips = { ...TIPS, alias: 'M3' }
  assert.deepEqual(branchTipHashes(COMMITS, ['main', 'alias'], tips).sort(), ['M3'])
})

check('filtering by a branch whose tip is off-page shows nothing, not everything', () => {
  const page2 = COMMITS.slice(4)
  const out = filterCommits(page2, { ...EMPTY_FILTER, branches: ['release'] }, TIPS)
  assert.deepEqual(out, [], 'must not fall back to showing the whole page')
})

check('filtering is stable as pages accumulate', () => {
  // This mirrors what the app actually does: `useCommitGraph` APPENDS each page
  // (`setCommits(prev => [...prev, ...result.commits])`), so the pane always
  // filters over every commit loaded so far — not one page in isolation.
  //
  // That distinction is load-bearing. Reachability is computed over the array
  // it is given, so filtering page 2 ALONE would find no tip (the branch tip is
  // on page 1) and collapse to an empty graph. Accumulating is what keeps the
  // result identical to filtering the whole list, and this check pins it.
  const page1 = COMMITS.slice(0, 3)
  const accumulated = [...page1, ...COMMITS.slice(3)] // what the hook hands the pane
  const firstPage = filterCommits(page1, { ...EMPTY_FILTER, branches: ['main'] }, TIPS).map(x => x.hash)
  const afterSecondPage = filterCommits(accumulated, { ...EMPTY_FILTER, branches: ['main'] }, TIPS).map(x => x.hash)
  const whole = filterCommits(COMMITS, { ...EMPTY_FILTER, branches: ['main'] }, TIPS).map(x => x.hash)

  assert.deepEqual(afterSecondPage, whole, 'a fully loaded list must filter as one')
  // The first page alone legitimately shows fewer commits: the rest have not
  // been fetched yet. What must NOT happen is showing commits the filter
  // excludes.
  const excluded = new Set(COMMITS.map(c => c.hash).filter(h => !whole.includes(h)))
  assert.ok(firstPage.every(h => !excluded.has(h)), 'page 1 leaked an excluded commit')
})

console.log(`\n${ok} filter checks passed`)
