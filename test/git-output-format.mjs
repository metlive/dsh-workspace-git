/**
 * Host-side parsing of git output that carries PATHS or REF NAMES.
 *
 * Both cases here share one root cause: a `git` invocation that lets git
 * FORMAT the output for humans, and a parser that then assumes the bytes came
 * through verbatim. Git quotes and escapes anything non-ASCII, and it
 * abbreviates ref names in ways that collide with legitimate names. Neither
 * failure raises an error — the wrong string simply reaches the UI.
 *
 * Everything is driven against a real repository built from scratch, because
 * the whole point is what the real `git` binary actually emits.
 *
 *   - `diff-tree --name-only` WITHOUT `-z` returns `"\346\226\207..."` for a
 *     file named `中文.txt`, which is what the commit detail panel used to
 *     render as a filename.
 *   - A ref whose name merely ENDS in `/HEAD` (`foo/HEAD`) is an ordinary
 *     branch, but a `endsWith('/HEAD')` test hid it from the branch picker and
 *     from the filter's tip map. The real discriminator is whether the ref is
 *     SYMBOLIC.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const check = (name, passed, detail) => {
  results.push({ name, passed })
  console.log(`${passed ? 'OK  ' : 'FAIL'} ${name}${detail === undefined || passed ? '' : ' -> ' + detail}`)
}

const compileDir = mkdtempSync(join(tmpdir(), 'dsh-gitfmt-'))
const repoDir = mkdtempSync(join(tmpdir(), 'dsh-gitfmt-repo-'))
try {
  execFileSync('npx', ['tsc', 'src/git-commit-detail.ts', 'src/git-graph.ts', 'src/git-ref.ts', 'src/wire.ts',
    '--outDir', compileDir, '--module', 'nodenext', '--target', 'es2022', '--moduleResolution', 'nodenext',
    '--skipLibCheck', '--allowImportingTsExtensions', 'false', '--rewriteRelativeImportExtensions',
  ], { stdio: 'pipe' })
} catch (error) {
  console.error(String(error.stdout ?? '') + String(error.stderr ?? ''))
  throw error
}
const { fetchCommitDetail } = await import(join(compileDir, 'git-commit-detail.js'))
const { fetchRefTips } = await import(join(compileDir, 'git-graph.js'))

const git = (...args) => execFileSync('git', args, { cwd: repoDir, stdio: 'pipe', encoding: 'utf8' })

git('init', '-q', '.')
git('config', 'user.email', 'test@example.com')
git('config', 'user.name', 'Test')

// --- Files whose names git would quote --------------------------------------
writeFileSync(join(repoDir, 'plain.txt'), 'a\n')
writeFileSync(join(repoDir, 'with space.txt'), 'b\n')
writeFileSync(join(repoDir, '中文文件名.txt'), 'c\n')
writeFileSync(join(repoDir, 'quote"name.txt'), 'd\n')
git('add', '-A')
git('commit', '-qm', 'init')

const head = git('rev-parse', 'HEAD').trim()
const detail = await fetchCommitDetail(repoDir, head)
const files = new Set(detail.files)

check('plain path survives', files.has('plain.txt'))
check('path with a space survives', files.has('with space.txt'))
// The regression: without `-z` this came back as "\344\270\255\346\226\207...".
check('non-ASCII path is NOT octal-quoted', files.has('中文文件名.txt'),
  [...files].find(f => f.includes('\\')) ?? 'missing')
check('quote-bearing path is NOT escaped', files.has('quote"name.txt'),
  [...files].find(f => f.includes('\\')) ?? 'missing')
check('no path contains an octal escape', ![...files].some(f => /\\[0-9]{3}/.test(f)))
check('no path is left wrapped in double quotes', ![...files].some(f => f.startsWith('"') || f.endsWith('"')))
check('every file is reported once', detail.files.length === 4, `got ${detail.files.length}`)

// --- Refs whose names merely end in /HEAD -----------------------------------
// These are ORDINARY branches; git allows them.
git('branch', 'foo/HEAD')
git('branch', 'nested/deep/HEAD')
git('branch', 'plain')
// A tag too, since tags share the same enumeration.
git('tag', 'v1/HEAD')

// And a genuine SYMBOLIC remote HEAD, which must be skipped.
git('update-ref', 'refs/remotes/origin/plain', 'HEAD')
git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/heads/plain')

const tipMaps = await fetchRefTips(repoDir)
const tips = tipMaps.tips
const keys = Object.keys(tips)

check('ordinary branch named foo/HEAD is listed', keys.includes('foo/HEAD'))
check('ordinary branch nested/deep/HEAD is listed', keys.includes('nested/deep/HEAD'))
check('ordinary tag named v1/HEAD is listed', keys.includes('v1/HEAD'))
check('ordinary branch plain is listed', keys.includes('plain'))
check('symbolic origin/HEAD is skipped', !keys.includes('origin/HEAD'))
check('the remote-tracking branch itself is listed', keys.includes('origin/plain'))
check('branch tips exclude tags', !Object.keys(tipMaps.branches).includes('v1/HEAD'))
check('branch tips include local branches', Object.keys(tipMaps.branches).includes('foo/HEAD'))

// The tips map is what resolves a selected branch to a walk root, so a missing
// key means the filter silently returns an empty graph for that branch.
check('every listed ref maps to a full object id',
  keys.every(k => /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(tips[k])),
  keys.find(k => !/^[0-9a-f]{40}$/i.test(tips[k] ?? '')) ?? '')

const failed = results.filter((r) => !r.passed)
console.log(`\n${failed.length === 0 ? 'GIT OUTPUT FORMAT PASSED' : `${failed.length} FAILED`} (${results.length - failed.length}/${results.length})`)
rmSync(compileDir, { recursive: true, force: true })
rmSync(repoDir, { recursive: true, force: true })
process.exit(failed.length === 0 ? 0 : 1)
