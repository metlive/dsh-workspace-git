/**
 * Host-side work-tree status: the pre-switch guard's data source.
 *
 * This drives the REAL `workTreeStatus` (compiled from source, like the other
 * host tests) against genuine repositories built from scratch, because the
 * parsing contract here is positional and cannot be verified by inspection:
 *
 *  - `git status --porcelain=v1 -z` puts a status code whose FIRST character is
 *    a space for worktree-only changes (`" D"`, `" M"`). Trimming stdout strips
 *    it and shifts the path slice by one — which turned `delete-me.txt` into
 *    `elete-me.txt` in the first revision of this code. That regression is the
 *    reason this file exists.
 *  - A rename (`R`) emits TWO NUL-terminated fields (new path, then source)
 *    sharing one record. Failing to consume the second desynchronises the whole
 *    parse, so every later entry is garbage.
 *  - `-z` does NOT quote paths, so names containing spaces must survive intact.
 *
 * A test that only checked "some changes were reported" would have passed
 * against every one of those bugs.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const check = (name, passed, detail) => {
  results.push({ name, passed })
  console.log(`${passed ? 'OK  ' : 'FAIL'} ${name}${detail === undefined || passed ? '' : ' -> ' + detail}`)
}

const compileDir = mkdtempSync(join(tmpdir(), 'dsh-status-test-'))
const repoDir = mkdtempSync(join(tmpdir(), 'dsh-status-repo-'))
try {
  execFileSync('npx', ['tsc', 'src/git-checkout.ts', 'src/git-graph.ts', 'src/git-ref.ts', 'src/wire.ts',
    '--outDir', compileDir, '--module', 'nodenext', '--target', 'es2022', '--moduleResolution', 'nodenext',
    '--skipLibCheck', '--allowImportingTsExtensions', 'false', '--rewriteRelativeImportExtensions',
  ], { stdio: 'pipe' })
} catch (error) {
  console.error(String(error.stdout ?? '') + String(error.stderr ?? ''))
  throw error
}
const { workTreeStatus } = await import(join(compileDir, 'git-checkout.js'))

const git = (...args) => execFileSync('git', args, { cwd: repoDir, stdio: 'pipe' })

// --- A repository with one of every interesting status -----------------------
git('init', '-q', '.')
git('config', 'user.email', 'test@example.com')
git('config', 'user.name', 'Test')
writeFileSync(join(repoDir, 'keep.txt'), 'a\n')
writeFileSync(join(repoDir, 'rename-me.txt'), 'b\n')
writeFileSync(join(repoDir, 'delete-me.txt'), 'c\n')
mkdirSync(join(repoDir, 'dir with space'), { recursive: true })
writeFileSync(join(repoDir, 'dir with space', 'file name.txt'), 'd\n')
git('add', '-A')
git('commit', '-qm', 'init')

// --- Clean tree first --------------------------------------------------------
const clean = await workTreeStatus(repoDir)
check('clean tree reports no changes', clean.changes.length === 0, `got ${clean.changes.length}`)
check('clean tree reports total 0', clean.total === 0)
check('clean tree reports the branch', clean.branch === 'main' || clean.branch === 'master', String(clean.branch))
check('clean tree reports a work-tree root', typeof clean.workTree === 'string' && clean.workTree !== '')
check('clean tree is not truncated', clean.truncated === false)

// --- Now dirty it in every way ----------------------------------------------
writeFileSync(join(repoDir, 'keep.txt'), 'a\nchanged\n')          // " M"
unlinkSync(join(repoDir, 'delete-me.txt'))                        // " D"
git('mv', 'rename-me.txt', 'renamed.txt')                         // "R "
writeFileSync(join(repoDir, 'untracked.txt'), 'new\n')            // "??"
mkdirSync(join(repoDir, 'newdir'), { recursive: true })
writeFileSync(join(repoDir, 'newdir', 'inside.txt'), 'x\n')       // "??" (nested)
writeFileSync(join(repoDir, 'dir with space', 'another new.txt'), 'y\n') // "??" (spaces)

const dirty = await workTreeStatus(repoDir)
const byPath = new Map(dirty.changes.map((c) => [c.path, c]))

check('dirty tree reports every entry', dirty.changes.length === 6, `got ${dirty.changes.length}`)
check('total matches entry count when not truncated', dirty.total === 6, `got ${dirty.total}`)

// The leading-space case: `" D"` must survive, or the path loses its first char.
const deleted = byPath.get('delete-me.txt')
check('worktree-only delete keeps its full path',
  deleted !== undefined && deleted.path === 'delete-me.txt',
  deleted === undefined ? 'missing' : `got "${deleted.path}"`)
check('worktree-only delete keeps the leading space in its status',
  deleted !== undefined && deleted.status === ' D',
  deleted === undefined ? 'missing' : `got "${JSON.stringify(deleted.status)}"`)

const modified = byPath.get('keep.txt')
check('worktree-only modify keeps the leading space in its status',
  modified !== undefined && modified.status === ' M',
  modified === undefined ? 'missing' : `got "${JSON.stringify(modified.status)}"`)

// The rename case: the NEW path is listed, and the source must NOT leak out as
// its own entry (that leak is the desync symptom).
const renamed = byPath.get('renamed.txt')
check('rename lists the new path', renamed !== undefined && renamed.status.startsWith('R'),
  renamed === undefined ? 'missing' : `got "${renamed.status}"`)
check('rename source is NOT listed as a separate entry', !byPath.has('rename-me.txt'))

// Untracked cases, including names with spaces.
const untracked = byPath.get('untracked.txt')
check('untracked file is flagged untracked', untracked !== undefined && untracked.untracked === true)
check('nested untracked file is listed individually', byPath.has('newdir/inside.txt'))
check('untracked path with spaces survives intact', byPath.has('dir with space/another new.txt'))

// Path hygiene: the desync bug produced garbage entries, so assert none.
const malformed = dirty.changes.filter((c) => c.path === '' || c.path.includes('\0'))
check('no malformed or empty paths', malformed.length === 0, `${malformed.length} found`)

// Tracked vs untracked split, which drives the dialog's grouping.
const untrackedCount = dirty.changes.filter((c) => c.untracked).length
check('exactly three entries are untracked', untrackedCount === 3, `got ${untrackedCount}`)

// --- A path is still resolvable from a SUBDIRECTORY of the repo --------------
const fromSub = await workTreeStatus(join(repoDir, 'newdir'))
check('status resolves from a subdirectory', fromSub.changes.length === 6, `got ${fromSub.changes.length}`)
check('status from a subdirectory reports the repo root',
  fromSub.workTree === dirty.workTree, `${fromSub.workTree} vs ${dirty.workTree}`)

// --- A non-repository is a clean error, not a crash --------------------------
const outside = mkdtempSync(join(tmpdir(), 'dsh-not-a-repo-'))
let notRepoCode = null
try {
  // Use a path whose ancestors have no .git. macOS temp dirs qualify.
  await workTreeStatus(outside)
} catch (error) {
  notRepoCode = error?.code ?? null
}
check('a non-repository raises bad-request', notRepoCode === 'bad-request', String(notRepoCode))
rmSync(outside, { recursive: true, force: true })

const failed = results.filter((r) => !r.passed)
console.log(`\n${failed.length === 0 ? 'WORK TREE STATUS PASSED' : `${failed.length} FAILED`} (${results.length - failed.length}/${results.length})`)
rmSync(compileDir, { recursive: true, force: true })
rmSync(repoDir, { recursive: true, force: true })
process.exit(failed.length === 0 ? 0 : 1)
