import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
//#region src/git-ref.ts
/**
* Pure `.git` ref parsing — the whole branch-detection brain of this plugin,
* deliberately free of `node:fs` so it is unit-testable without a repository.
*
* Why parse the files instead of shelling out to `git`:
* - no subprocess means no shell, no PATH lookup, no argument quoting surface,
*   and no sandbox/approval prompt on every poll;
* - reading `HEAD` is exactly what `git rev-parse --abbrev-ref HEAD` reads for
*   the common case, and it is O(1) instead of O(repo).
*
* The tradeoff (documented in the README): a ref written by a newer git that
* this parser does not understand yields `undefined`, i.e. "no branch shown" —
* never a wrong branch and never an error surface.
*/
/** A `ref: refs/heads/<name>` line. Git writes the ref name verbatim after the prefix. */
const HEAD_REF = /^ref:\s+(.+?)\s*$/;
/** The `gitdir: <path>` line of a `.git` FILE (linked worktree / submodule). */
const GITDIR_POINTER = /^gitdir:\s*(.+?)\s*$/;
/** A raw object id: 40 hex (SHA-1) or 64 hex (SHA-256 repositories). */
const OBJECT_ID$1 = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;
/**
* Strip the `refs/heads/` prefix from a full ref name.
*
* `refs/heads/feature/x` → `feature/x`; anything else (a remote ref, a tag, a
* bare ref) is returned unchanged, because those are already the most useful
* spelling of themselves.
* @param ref - the full ref name from `HEAD`.
* @returns the display name.
*/
function shortRefName(ref) {
	return ref.startsWith("refs/heads/") ? ref.slice(11) : ref;
}
/**
* Parse the contents of a repository's `HEAD` file.
*
* Handles the two shapes git writes:
* - `ref: refs/heads/main` — the ordinary symbolic ref (also `refs/remotes/…`
*   in the odd case of a checked-out remote ref);
* - a raw object id — a detached HEAD, shown as its short id.
*
* Anything else (empty file, a corrupt ref, an unborn branch spelled in a way
* this parser does not know) returns `undefined`, which the callers render as
* "no branch" rather than as an error.
* @param headText - the raw `HEAD` file contents.
* @returns the parsed head, or undefined when it is not a shape we understand.
*/
function parseHead(headText) {
	const text = headText.trim();
	if (text === "") return void 0;
	const ref = HEAD_REF.exec(text);
	if (ref !== null) {
		const name = shortRefName(ref[1] ?? "");
		return name === "" ? void 0 : {
			branch: name,
			detached: false
		};
	}
	if (OBJECT_ID$1.test(text)) return {
		branch: text.slice(0, 7),
		detached: true
	};
}
/**
* Parse a `.git` FILE (the pointer git writes for linked worktrees and
* submodules, whose real git directory lives elsewhere).
* @param pointerText - the raw `.git` file contents.
* @returns the git directory it points at, or undefined.
*/
function parseGitDirPointer(pointerText) {
	const target = GITDIR_POINTER.exec(pointerText.trim())?.[1]?.trim();
	return target === void 0 || target === "" ? void 0 : target;
}
/**
* Whether a remote-tracking name is the remote's symbolic HEAD (`origin/HEAD`),
* which is not useful in a branch picker.
* @param name - the name under `refs/remotes/` (e.g. `origin/HEAD`).
*/
function isRemoteHeadRef(name) {
	return name === "HEAD" || name.endsWith("/HEAD");
}
/**
* Extract local and remote-tracking branch names from a `packed-refs` file.
*
* `packed-refs` is git's compaction of `refs/` into one file: a header line
* (`# pack-refs with: …`), optional `^<sha>` peeled-tag lines that belong to the
* line above them, and `<sha> <refname>` rows. Tags are ignored; remote
* symbolic HEAD refs (names ending in `/HEAD`) are skipped.
*
* A loose ref file always overrides its packed entry, so the caller merges the
* two — but for LISTING purposes a duplicate name is harmless and de-duplication
* happens in {@link mergeRefNames}.
* @param text - the raw `packed-refs` contents.
* @returns the candidates found, in file order.
*/
function parsePackedRefs(text) {
	const heads = "refs/heads/";
	const remotes = "refs/remotes/";
	const out = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("^")) continue;
		const space = trimmed.indexOf(" ");
		if (space === -1) continue;
		const ref = trimmed.slice(space + 1).trim();
		if (ref.startsWith(heads)) {
			const name = ref.slice(11);
			if (name !== "") out.push({
				name,
				kind: "local"
			});
			continue;
		}
		if (ref.startsWith(remotes)) {
			const name = ref.slice(13);
			if (name !== "" && !isRemoteHeadRef(name)) out.push({
				name,
				kind: "remote"
			});
		}
	}
	return out;
}
/**
* Merge loose and packed ref candidates into one display list.
*
* Loose refs win on duplicates (they are the newer spelling). Within each
* kind, entries sort by loose mtime descending (most recently touched first),
* then by name — so the menu's default "recent" window is stable and useful.
* Locals are listed before remotes in the flat array; the UI groups them.
*
* The current local branch is flagged rather than force-reordered: the client
* keeps it visible when truncating to the recent window.
* @param loose - candidates from loose ref files (may carry mtime).
* @param packed - candidates from `packed-refs`.
* @param current - the checked-out local branch name, when HEAD is not detached.
* @returns the de-duplicated, sorted list.
*/
function mergeRefNames(loose, packed, current) {
	const keyOf = (kind, name) => `${kind}\0${name}`;
	const seen = /* @__PURE__ */ new Set();
	const merged = [];
	for (const entry of [...loose, ...packed]) {
		if (entry.name === "") continue;
		const key = keyOf(entry.kind, entry.name);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(entry);
	}
	merged.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "local" ? -1 : 1;
		const ma = a.mtimeMs ?? 0;
		const mb = b.mtimeMs ?? 0;
		if (ma !== mb) return mb - ma;
		return a.name.localeCompare(b.name);
	});
	return merged.map((entry) => ({
		name: entry.name,
		kind: entry.kind,
		current: entry.kind === "local" && entry.name === current
	}));
}
//#endregion
//#region src/git-branch.ts
/**
* Repository discovery, caching, and concurrency control for branch lookups.
*
* Three properties matter here, in order:
*
* 1. **Never throw.** Every failure — a missing directory, a permission error,
*    a `.git` that is neither file nor directory, a race with `git checkout`
*    rewriting HEAD — collapses to `undefined`, which the client renders as
*    "no branch". The UI must never show an error placeholder for a plain
*    non-repository folder.
* 2. **Never spawn.** Branch detection is a couple of small file reads (see
*    git-ref.ts); no subprocess, no PATH, no sandbox prompt.
* 3. **Never stampede.** The sidebar asks about every workspace row on every
*    DOM sync, so lookups are cached with a short TTL and de-duplicated per
*    path, and the walk upward is depth-bounded.
*/
/**
* How long a resolved answer stays fresh. Long enough that a streaming chat
* turn's DOM churn costs zero filesystem work, short enough that a branch
* switch shows up while the user is still looking at the row.
*/
const CACHE_TTL_MS = 3e3;
/** Read a file, mapping every failure (ENOENT, EACCES, EISDIR…) to undefined. */
async function readIfPossible(path) {
	try {
		return await readFile(path, "utf8");
	} catch {
		return;
	}
}
/**
* Resolve the real git directory of a repository whose `.git` entry sits at
* `gitEntry`, or undefined when it is not a usable repository.
*
* `.git` is a DIRECTORY in an ordinary clone and a FILE containing
* `gitdir: <path>` in a linked worktree or submodule. The pointer's path is
* resolved against the directory holding the `.git` file, which is what git
* itself does for the relative form it normally writes.
* @param gitEntry - absolute path of the `.git` entry.
* @returns the git directory, or undefined.
*/
async function gitDirOf(gitEntry) {
	try {
		const info = await stat(gitEntry);
		if (info.isDirectory()) return gitEntry;
		if (!info.isFile()) return void 0;
	} catch {
		return;
	}
	const pointer = await readIfPossible(gitEntry);
	if (pointer === void 0) return void 0;
	const target = parseGitDirPointer(pointer);
	if (target === void 0) return void 0;
	return isAbsolute(target) ? target : resolve(dirname(gitEntry), target);
}
/**
* Read one repository's HEAD by walking up from `startPath`.
*
* The walk stops at the first `.git` entry found — the nearest repository wins,
* which is what makes a nested repository inside a monorepo report its own
* branch rather than the outer one.
* @param startPath - an absolute directory to start from.
* @returns the parsed head, or undefined when no repository is found.
*/
async function findHead(startPath) {
	let current = startPath;
	for (let depth = 0; depth <= 12; depth += 1) {
		const gitDir = await gitDirOf(join(current, ".git"));
		if (gitDir !== void 0) {
			const headText = await readIfPossible(join(gitDir, "HEAD"));
			if (headText === void 0) return void 0;
			return parseHead(headText);
		}
		const parent = dirname(current);
		if (parent === current) return void 0;
		current = parent;
	}
}
/**
* Find the repository containing `startPath` and return its git directory.
*
* Shares the walk with {@link findHead}: the nearest `.git` entry wins, so a
* nested repository reports its own branches.
* @param startPath - an absolute directory to start from.
* @returns the git directory, or undefined when no repository is found.
*/
async function findGitDir(startPath) {
	let current = startPath;
	for (let depth = 0; depth <= 12; depth += 1) {
		const gitDir = await gitDirOf(join(current, ".git"));
		if (gitDir !== void 0) return gitDir;
		const parent = dirname(current);
		if (parent === current) return void 0;
		current = parent;
	}
}
/**
* Read a directory's entry names, mapping every failure to an empty list.
* @param dir - the directory to list.
* @returns the entry names (files and directories alike).
*/
async function readDirNames(dir) {
	try {
		return await readdir(dir);
	} catch {
		return [];
	}
}
/**
* Walk one refs tree (heads or remotes) into loose candidates with mtimes.
* @param root - absolute path of `refs/heads` or `refs/remotes`.
* @param kind - local vs remote-tracking.
* @returns loose candidates found under the tree.
*/
async function walkLooseRefs(root, kind) {
	const loose = [];
	const walk = async (dir, prefix, depth) => {
		if (depth > 8) return;
		for (const entry of await readDirNames(dir)) {
			const full = join(dir, entry);
			const name = prefix === "" ? entry : `${prefix}/${entry}`;
			try {
				const info = await stat(full);
				if (info.isDirectory()) await walk(full, name, depth + 1);
				else if (info.isFile()) {
					if (kind === "remote" && isRemoteHeadRef(name)) continue;
					loose.push({
						name,
						kind,
						mtimeMs: info.mtimeMs
					});
				}
			} catch {}
		}
	};
	await walk(root, "", 0);
	return loose;
}
/**
* List the local and remote-tracking branches of the repository containing
* `path`.
*
* Branches live in two places, and a repository may use either or both: loose
* files under `.git/refs/heads/` / `.git/refs/remotes/` (possibly nested, since
* a branch name may contain slashes) and the compacted `.git/packed-refs`. Both
* are read; a freshly created branch is loose, and an old clone's branches are
* packed. Loose mtimes drive the "recent" order the menu truncates against.
*
* Returns an empty list for anything that is not a repository or cannot be read
* — the caller renders no menu rather than an error.
* @param path - an absolute directory inside the repository.
* @returns the sorted branch entries, empty when there are none to show.
*/
async function findRefs(path) {
	const gitDir = await findGitDir(path);
	if (gitDir === void 0) return [];
	const headText = await readIfPossible(join(gitDir, "HEAD"));
	const head = headText === void 0 ? void 0 : parseHead(headText);
	const current = head !== void 0 && !head.detached ? head.branch : void 0;
	const loose = [...await walkLooseRefs(join(gitDir, "refs", "heads"), "local"), ...await walkLooseRefs(join(gitDir, "refs", "remotes"), "remote")];
	const packedText = await readIfPossible(join(gitDir, "packed-refs"));
	return mergeRefNames(loose, packedText === void 0 ? [] : parsePackedRefs(packedText), current);
}
/**
* The branch cache: TTL'd answers plus in-flight de-duplication.
*
* One instance is created per plugin activation (never a module-level
* singleton, matching the DSH store rule) and disposed with the fiber.
*/
var BranchCache = class {
	ttlMs;
	entries = /* @__PURE__ */ new Map();
	inflight = /* @__PURE__ */ new Map();
	refEntries = /* @__PURE__ */ new Map();
	refInflight = /* @__PURE__ */ new Map();
	disposed = false;
	/** @param ttlMs - freshness window; overridable for tests. */
	constructor(ttlMs = CACHE_TTL_MS) {
		this.ttlMs = ttlMs;
	}
	/**
	* The branch list of the repository containing `path`, cached and
	* de-duplicated exactly like {@link headOf}.
	* @param path - an absolute directory path.
	* @returns the sorted branch entries, empty when there is nothing to show.
	*/
	async refsOf(path) {
		if (this.disposed) return [];
		const now = Date.now();
		const cached = this.refEntries.get(path);
		if (cached !== void 0 && cached.expiresAt > now) return cached.refs;
		const pending = this.refInflight.get(path);
		if (pending !== void 0) return pending;
		const task = findRefs(path).catch(() => []).then((refs) => {
			if (!this.disposed) this.refEntries.set(path, {
				refs,
				expiresAt: Date.now() + this.ttlMs
			});
			return refs;
		}).finally(() => {
			this.refInflight.delete(path);
		});
		this.refInflight.set(path, task);
		return task;
	}
	/**
	* The head of the repository containing `path`, cached and de-duplicated.
	*
	* Concurrent calls for the same path share one filesystem walk. A failure is
	* cached too (as "no branch") for the TTL, so a directory that is not a
	* repository does not cost a walk on every sync.
	* @param path - an absolute directory path.
	* @returns the head, or undefined when there is none to show.
	*/
	async headOf(path) {
		if (this.disposed) return void 0;
		const now = Date.now();
		const cached = this.entries.get(path);
		if (cached !== void 0 && cached.expiresAt > now) return cached.head;
		const pending = this.inflight.get(path);
		if (pending !== void 0) return pending;
		const task = findHead(path).catch(() => void 0).then((head) => {
			if (!this.disposed) this.entries.set(path, {
				head,
				expiresAt: Date.now() + this.ttlMs
			});
			return head;
		}).finally(() => {
			this.inflight.delete(path);
		});
		this.inflight.set(path, task);
		return task;
	}
	/**
	* Resolve many paths in one call, preserving request order.
	*
	* Every path resolves independently: one unreadable directory never fails
	* its siblings.
	* @param paths - absolute directory paths (already bounded by the caller).
	* @returns one entry per path, in the same order.
	*/
	async headsOf(paths) {
		return await Promise.all(paths.map(async (path) => ({
			path,
			head: await this.headOf(path)
		})));
	}
	/**
	* Drop the cached answers for one path (or every path), so the next lookup
	* re-reads HEAD / refs. Used after a successful checkout.
	* @param path - absolute path to invalidate; omit to clear the whole cache.
	*/
	invalidate(path) {
		if (path === void 0) {
			this.entries.clear();
			this.refEntries.clear();
			return;
		}
		this.entries.delete(path);
		this.refEntries.delete(path);
	}
	/** Drop every cached answer, keeping the instance usable (settings change). */
	clear() {
		this.invalidate();
	}
	/** Release the cache; later lookups answer undefined. */
	dispose() {
		this.disposed = true;
		this.entries.clear();
		this.inflight.clear();
		this.refEntries.clear();
		this.refInflight.clear();
	}
};
//#endregion
//#region src/git-graph.ts
/**
* Host-side commit-graph snapshot: runs `git log` in the work tree and parses
* the same record format ZCode uses. Branch detection elsewhere stays file-
* based; the graph is the one place a git binary is required, because a full
* topo history is not practical to rebuild from loose objects alone.
*/
const execFileAsync$2 = promisify(execFile);
/** Field separator inside one commit record (`%x00`). */
const FIELD_SEP = "\0";
/** Record separator between commits (`%x1e`). */
const RECORD_SEP = "";
/**
* Resolve whether `gitEntry` is a usable git directory (dir or gitdir pointer).
* @param gitEntry - absolute path of the `.git` entry.
* @returns true when a repository is present at this entry.
*/
async function isGitEntry(gitEntry) {
	try {
		const info = await stat(gitEntry);
		if (info.isDirectory()) return true;
		if (!info.isFile()) return false;
		const text = await readFile(gitEntry, "utf8").catch(() => void 0);
		if (text === void 0) return false;
		return parseGitDirPointer(text) !== void 0;
	} catch {
		return false;
	}
}
/**
* Walk upward from `startPath` to the work-tree root (directory holding `.git`).
* @param startPath - absolute workspace path.
* @returns the work-tree root, or undefined.
*/
async function findWorkTree(startPath) {
	let current = startPath;
	for (let depth = 0; depth <= 12; depth += 1) {
		if (await isGitEntry(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return void 0;
		current = parent;
	}
}
function addRef(refs, next) {
	if (refs.some((entry) => entry.name === next.name && entry.kind === next.kind)) return;
	refs.push(next);
}
function parseDecorationRef(rawRef) {
	const ref = rawRef.trim();
	if (!ref) return null;
	if (ref === "HEAD") return {
		name: "HEAD",
		kind: "head"
	};
	if (ref.startsWith("tag: ")) {
		const tagRef = ref.slice(5).trim();
		const name = tagRef.startsWith("refs/tags/") ? tagRef.slice(10) : tagRef;
		return name ? {
			name,
			kind: "tag"
		} : null;
	}
	if (ref.startsWith("refs/heads/")) {
		const name = ref.slice(11);
		return name ? {
			name,
			kind: "branch"
		} : null;
	}
	if (ref.startsWith("refs/remotes/")) {
		const name = ref.slice(13);
		return name ? {
			name,
			kind: "remote"
		} : null;
	}
	if (ref.startsWith("refs/tags/")) {
		const name = ref.slice(10);
		return name ? {
			name,
			kind: "tag"
		} : null;
	}
	return {
		name: ref,
		kind: ref.includes("/") ? "remote" : "branch"
	};
}
function parseRefs(rawDecorations) {
	const refs = [];
	for (const raw of rawDecorations.split(",")) {
		const decoration = raw.trim();
		if (!decoration) continue;
		if (decoration.startsWith("HEAD -> ")) {
			addRef(refs, {
				name: "HEAD",
				kind: "head"
			});
			const pointed = parseDecorationRef(decoration.slice(8));
			if (pointed) addRef(refs, pointed);
			continue;
		}
		const parsed = parseDecorationRef(decoration);
		if (parsed) addRef(refs, parsed);
	}
	return refs;
}
/**
* Parse `git log --format=…%x1e` stdout into commit rows.
* @param stdout - raw git log output.
* @returns the commits in topo/date order.
*/
function parseGitGraphRecords(stdout) {
	return stdout.split(RECORD_SEP).map((record) => record.trim()).filter((record) => record.length > 0).map((record) => {
		const [hash, parents, authorName, authoredAtSeconds, subject, decorations] = record.split(FIELD_SEP);
		if (!hash) return null;
		const timestampSeconds = authoredAtSeconds ? Number.parseInt(authoredAtSeconds, 10) : NaN;
		return {
			hash,
			parents: parents ? parents.split(" ").filter(Boolean) : [],
			refs: parseRefs(decorations ?? ""),
			subject: subject ?? "",
			authorName: authorName || null,
			authoredAtMs: Number.isNaN(timestampSeconds) ? null : timestampSeconds * 1e3
		};
	}).filter((commit) => commit !== null);
}
function clampPageSize(maxCount) {
	if (maxCount === void 0 || !Number.isFinite(maxCount)) return 50;
	return Math.min(200, Math.max(1, Math.floor(maxCount)));
}
function clampSkip(skip) {
	if (skip === void 0 || !Number.isFinite(skip)) return 0;
	return Math.max(0, Math.floor(skip));
}
/**
* Fetch one page of the commit graph for the repository containing `path`.
* @param path - absolute workspace path.
* @param maxCount - page size (default 50, max 200).
* @param skip - how many commits to skip.
* @returns commits plus whether another page exists; empty when not a repo.
*/
async function fetchCommitGraph(path, maxCount, skip) {
	const workTree = await findWorkTree(path);
	if (workTree === void 0) return {
		commits: [],
		hasMore: false
	};
	const pageSize = clampPageSize(maxCount);
	const offset = clampSkip(skip);
	try {
		const { stdout } = await execFileAsync$2("git", [
			"log",
			"HEAD",
			"--branches",
			"--tags",
			"--remotes",
			"--date-order",
			"--topo-order",
			`--skip=${offset}`,
			`--max-count=${pageSize + 1}`,
			`--format=%H%x00%P%x00%an%x00%at%x00%s%x00%D%x1e`
		], {
			cwd: workTree,
			encoding: "utf8",
			timeout: 15e3,
			maxBuffer: 8388608
		});
		const parsed = parseGitGraphRecords(stdout);
		return {
			commits: parsed.slice(0, pageSize),
			hasMore: parsed.length > pageSize
		};
	} catch (error) {
		const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
		if (message.includes("does not have any commits yet") || message.includes("bad default revision") || message.includes("unknown revision") || message.includes("not a git repository")) return {
			commits: [],
			hasMore: false
		};
		throw error;
	}
}
//#endregion
//#region src/wire.ts
/** One API failure with its wire code and HTTP status. */
var WorkspaceGitError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
};
/** Body size bound of one JSON request (defense against unbounded reads). */
const MAX_BODY_BYTES = 1 << 18;
/** Write one JSON response. */
function writeJson(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(text);
}
/** Write the success envelope. */
function writeOk(res, value) {
	writeJson(res, 200, {
		ok: true,
		value
	});
}
/** HTTP status matching one error code. */
function statusOf(error) {
	switch (error.code) {
		case "forbidden": return 403;
		case "too-large": return 413;
		case "method-error": return 405;
		case "internal": return 500;
		default: return 400;
	}
}
/**
* Write the failure envelope for any thrown value.
*
* An unknown error is reported as `internal` with its message, which is the
* only place a raw error text reaches the client — the client renders nothing
* for a failure anyway (see the silent-failure contract in the README), so this
* exists for the network panel and for tests, not for the user.
*/
function writeError(res, error) {
	const failure = error instanceof WorkspaceGitError ? error : new WorkspaceGitError("internal", error instanceof Error ? error.message : String(error));
	writeJson(res, statusOf(failure), {
		ok: false,
		error: {
			code: failure.code,
			message: failure.message
		}
	});
}
/**
* Read and parse one JSON request body, bounded by {@link MAX_BODY_BYTES}.
*
* Chunks arrive as strings or bytes depending on the server's encoding setup,
* so both are accepted and concatenated before parsing.
* @param req - the incoming request.
* @returns the parsed body.
* @throws WorkspaceGitError on an oversized, empty, or malformed body.
*/
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		size += Buffer.byteLength(text);
		if (size > MAX_BODY_BYTES) throw new WorkspaceGitError("too-large", "request body too large", 413);
		chunks.push(text);
	}
	const raw = chunks.join("");
	if (raw === "") return {};
	try {
		return JSON.parse(raw);
	} catch {
		throw new WorkspaceGitError("bad-request", "request body is not valid JSON");
	}
}
//#endregion
//#region src/git-checkout.ts
/**
* Host-side branch checkout: runs `git switch` in the work tree.
*
* Branch detection stays file-based elsewhere; switching is the one write path
* and needs a git binary. The branch name is validated before it reaches the
* argv, so a crafted menu row cannot pass flags or pathspecs.
*
* Remote-tracking refs (`origin/feature`) use `git switch --track` so a local
* branch is created (or reused) rather than leaving HEAD detached.
*/
const execFileAsync$1 = promisify(execFile);
/** Conservative allowlist for local / remote-tracking branch names. */
const SAFE_BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._][A-Za-z0-9._/-]{0,254}$/;
/**
* Reject branch names that could be mistaken for git options or pathspecs.
* @param branch - the short local or remote-tracking name from the client.
* @throws WorkspaceGitError when the name is not safe to pass to git.
*/
function assertSafeBranchName(branch) {
	if (typeof branch !== "string" || branch === "") throw new WorkspaceGitError("bad-request", "branch must be a non-empty string");
	if (!SAFE_BRANCH.test(branch)) throw new WorkspaceGitError("bad-request", `branch name "${branch}" is not allowed`);
}
/**
* Run one `git` command in the work tree, mapping a non-zero exit to a
* `bad-request` error that carries git's stderr (so the client can show it).
* @param workTree - absolute work-tree root.
* @param args - the argv after `git` (branch names are validated upstream).
* @param fallback - the message when git prints no stderr.
* @returns stdout (trimmed), when the command succeeds.
*/
async function runGit(workTree, args, fallback) {
	try {
		const { stdout } = await execFileAsync$1("git", [...args], {
			cwd: workTree,
			encoding: "utf8",
			timeout: 3e4,
			maxBuffer: 1048576
		});
		return typeof stdout === "string" ? stdout.trim() : "";
	} catch (error) {
		throw new WorkspaceGitError("bad-request", ((error !== null && typeof error === "object" && "stderr" in error ? String(error.stderr ?? "") : "").trim() || (error instanceof Error ? error.message : String(error))).trim() || fallback, 400);
	}
}
/**
* Local short name implied by a remote-tracking ref (`origin/feature/x` →
* `feature/x`). Returns undefined when the name has no remote prefix.
* @param remoteRef - e.g. `origin/main`.
*/
function localNameFromRemote(remoteRef) {
	const slash = remoteRef.indexOf("/");
	if (slash <= 0 || slash === remoteRef.length - 1) return void 0;
	return remoteRef.slice(slash + 1);
}
/**
* Whether a local branch ref exists in the work tree.
* @param workTree - absolute work-tree root.
* @param local - short local branch name.
*/
async function localBranchExists(workTree, local) {
	try {
		await runGit(workTree, [
			"show-ref",
			"--verify",
			"--quiet",
			`refs/heads/${local}`
		], "");
		return true;
	} catch {
		return false;
	}
}
/**
* Checkout `branch` in the repository containing `path`.
*
* When `kind` is `remote`, uses `git switch --track` (or switches to an
* existing local branch of the same short name) so HEAD stays on a local
* branch. Otherwise runs a plain `git switch`.
* @param path - absolute workspace path.
* @param branch - short local name, or `remote/branch` for tracking refs.
* @param kind - optional explicit kind from the menu row.
* @returns the local branch that is now checked out.
* @throws WorkspaceGitError when the path is not a repo or git rejects the switch.
*/
async function checkoutBranch(path, branch, kind = "local") {
	assertSafeBranchName(branch);
	const workTree = await findWorkTree(path);
	if (workTree === void 0) throw new WorkspaceGitError("bad-request", "not a git repository", 400);
	if (kind === "remote") {
		const local = localNameFromRemote(branch);
		if (local === void 0) throw new WorkspaceGitError("bad-request", `remote branch "${branch}" is not allowed`, 400);
		assertSafeBranchName(local);
		if (await localBranchExists(workTree, local)) {
			await runGit(workTree, [
				"switch",
				"--",
				local
			], `failed to switch to "${local}"`);
			return { branch: local };
		}
		await runGit(workTree, [
			"switch",
			"--track",
			"--",
			branch
		], `failed to switch to tracking branch "${branch}"`);
		return { branch: await runGit(workTree, ["branch", "--show-current"], "failed to read current branch") || local };
	}
	await runGit(workTree, [
		"switch",
		"--",
		branch
	], `failed to switch to "${branch}"`);
	return { branch };
}
/**
* Create `branch` at the current HEAD and check it out (`git switch -c`).
* @param path - absolute workspace path.
* @param branch - short local branch name for the new branch.
* @returns the branch that is now checked out.
* @throws WorkspaceGitError when the path is not a repo, the name is unsafe,
*   or git rejects the create (e.g. the branch already exists).
*/
async function createBranch(path, branch) {
	assertSafeBranchName(branch);
	const workTree = await findWorkTree(path);
	if (workTree === void 0) throw new WorkspaceGitError("bad-request", "not a git repository", 400);
	await runGit(workTree, [
		"switch",
		"-c",
		branch
	], `failed to create "${branch}"`);
	return { branch };
}
//#endregion
//#region src/git-commit-detail.ts
/**
* Host-side single-commit detail: message metadata + changed file paths.
* Used by the graph's right-hand detail panel.
*/
const execFileAsync = promisify(execFile);
/** Full object id (SHA-1 or SHA-256). */
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;
/**
* @param hash - full commit object id.
* @throws WorkspaceGitError when the hash is not a safe object id.
*/
function assertSafeCommitHash(hash) {
	if (typeof hash !== "string" || !OBJECT_ID.test(hash)) throw new WorkspaceGitError("bad-request", "hash must be a full git object id");
}
function parseShowRecord(stdout) {
	const [hash, authorName, authorEmail, authoredAtSeconds, subjectRaw, bodyRaw, decorations] = stdout.split("\0");
	if (!hash || !OBJECT_ID.test(hash.trim())) throw new WorkspaceGitError("bad-request", "commit not found", 400);
	const timestampSeconds = authoredAtSeconds ? Number.parseInt(authoredAtSeconds, 10) : NaN;
	const refs = (decorations ?? "").split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
		if (part.startsWith("HEAD -> ")) return part.slice(8).trim() || "HEAD";
		if (part.startsWith("tag: ")) return part.slice(5).trim();
		return part;
	}).filter(Boolean);
	return {
		hash: hash.trim(),
		subject: (subjectRaw ?? "").trim(),
		body: (bodyRaw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd(),
		authorName: authorName || null,
		authorEmail: authorEmail || null,
		authoredAtMs: Number.isNaN(timestampSeconds) ? null : timestampSeconds * 1e3,
		refs
	};
}
/**
* Load one commit's metadata and changed file list.
* @param path - absolute workspace path.
* @param hash - full commit hash.
*/
async function fetchCommitDetail(path, hash) {
	assertSafeCommitHash(hash);
	const workTree = await findWorkTree(path);
	if (workTree === void 0) throw new WorkspaceGitError("bad-request", "not a git repository", 400);
	const execOpts = {
		cwd: workTree,
		encoding: "utf8",
		timeout: 2e4,
		maxBuffer: 4194304
	};
	try {
		const [{ stdout: showOut }, { stdout: filesOut }] = await Promise.all([execFileAsync("git", [
			"show",
			"-s",
			"--format=%H%x00%an%x00%ae%x00%at%x00%s%x00%b%x00%D%x00",
			hash
		], execOpts), execFileAsync("git", [
			"diff-tree",
			"--root",
			"--no-commit-id",
			"--name-only",
			"-r",
			hash
		], execOpts)]);
		const meta = parseShowRecord(showOut);
		const files = filesOut.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
		return {
			...meta,
			files
		};
	} catch (error) {
		if (error instanceof WorkspaceGitError) throw error;
		throw new WorkspaceGitError("bad-request", (error instanceof Error ? error.message : String(error)) || `failed to read commit ${hash}`, 400);
	}
}
//#endregion
//#region src/routes.ts
/**
* The plugin's fenced host routes under `POST /workspace-git/api/*`.
*
* - `branches` — batch current-branch lookup (file-based, no git binary)
* - `refs` — local + remote branch list for the composer menu
* - `graph` — commit-graph page via `git log` (needs a git binary)
* - `commit` — one commit's message + changed files (detail panel)
* - `checkout` — switch the work tree to a local or remote-tracking branch
* - `create-branch` — create + check out a new branch (`git switch -c`)
*/
/** Route path prefix; the API method is the final segment. */
const API_PREFIX = "/workspace-git/api";
/**
* Narrow an unknown payload to a bounded list of absolute paths.
* @param payload - the parsed request body.
* @returns the validated paths.
*/
function parseBranchesRequest(payload) {
	const paths = payload?.paths;
	if (!Array.isArray(paths)) throw new WorkspaceGitError("bad-request", "paths must be an array");
	if (paths.length > 64) throw new WorkspaceGitError("bad-request", `paths must contain at most 64 entries`);
	const validated = [];
	for (const entry of paths) {
		if (typeof entry !== "string" || entry === "") throw new WorkspaceGitError("bad-request", "every path must be a non-empty string");
		if (!isAbsolute(entry)) throw new WorkspaceGitError("bad-request", `path "${entry}" is not absolute`);
		if (!validated.includes(entry)) validated.push(entry);
	}
	return validated;
}
/**
* Resolve the branch answers for one payload.
* @param cache - the activation-scoped branch cache.
* @param payload - the parsed request body.
* @returns the per-path answer map.
*/
async function resolveBranches(cache, payload) {
	const paths = parseBranchesRequest(payload);
	const heads = await cache.headsOf(paths);
	const branches = {};
	for (const { path, head } of heads) branches[path] = head === void 0 ? {
		branch: null,
		detached: false
	} : {
		branch: head.branch,
		detached: head.detached
	};
	return { branches };
}
/**
* Narrow an unknown payload to the single absolute path the ref list is for.
* @param payload - the parsed request body.
* @returns the validated path.
*/
function parseRefsRequest(payload) {
	const path = payload?.path;
	if (typeof path !== "string" || path === "") throw new WorkspaceGitError("bad-request", "path must be a non-empty string");
	if (!isAbsolute(path)) throw new WorkspaceGitError("bad-request", `path "${path}" is not absolute`);
	return path;
}
/**
* Resolve the branch list of one repository.
* @param cache - the activation-scoped branch cache.
* @param payload - the parsed request body.
* @returns the branch list (empty for a directory that is not a repository).
*/
async function resolveRefs(cache, payload) {
	const path = parseRefsRequest(payload);
	const refs = await cache.refsOf(path);
	return {
		detached: refs.length > 0 && !refs.some((entry) => entry.current),
		refs: refs.map((entry) => ({
			name: entry.name,
			current: entry.current,
			kind: entry.kind
		}))
	};
}
/**
* Narrow a graph request: absolute path plus optional pagination.
* @param payload - the parsed request body.
* @returns path / maxCount / skip.
*/
function parseGraphRequest(payload) {
	const record = payload;
	const path = parseRefsRequest(record);
	let maxCount = 50;
	if (record?.maxCount !== void 0) {
		if (typeof record.maxCount !== "number" || !Number.isFinite(record.maxCount)) throw new WorkspaceGitError("bad-request", "maxCount must be a number");
		maxCount = Math.min(200, Math.max(1, Math.floor(record.maxCount)));
	}
	let skip = 0;
	if (record?.skip !== void 0) {
		if (typeof record.skip !== "number" || !Number.isFinite(record.skip)) throw new WorkspaceGitError("bad-request", "skip must be a number");
		skip = Math.max(0, Math.floor(record.skip));
	}
	return {
		path,
		maxCount,
		skip
	};
}
/**
* Resolve one page of the commit graph.
* @param payload - the parsed request body.
* @returns the graph page.
*/
async function resolveGraph(payload) {
	const { path, maxCount, skip } = parseGraphRequest(payload);
	return fetchCommitGraph(path, maxCount, skip);
}
/**
* Narrow a checkout request: absolute path + branch name + optional kind.
* @param payload - the parsed request body.
* @returns path, branch, and kind (defaults to local).
*/
function parseCheckoutRequest(payload) {
	const record = payload;
	const path = parseRefsRequest(record);
	const branch = record?.branch;
	if (typeof branch !== "string" || branch === "") throw new WorkspaceGitError("bad-request", "branch must be a non-empty string");
	return {
		path,
		branch,
		kind: record?.kind === "remote" ? "remote" : "local"
	};
}
/**
* Switch the work tree to the requested branch and bust the branch cache.
* @param cache - the activation-scoped branch cache.
* @param payload - the parsed request body.
* @returns the branch now checked out.
*/
async function resolveCheckout(cache, payload) {
	const { path, branch, kind } = parseCheckoutRequest(payload);
	const result = await checkoutBranch(path, branch, kind);
	cache.invalidate(path);
	return result;
}
/**
* Create and check out a new branch, then bust the branch cache.
* @param cache - the activation-scoped branch cache.
* @param payload - the parsed request body.
* @returns the branch now checked out.
*/
async function resolveCreateBranch(cache, payload) {
	const { path, branch } = parseCheckoutRequest(payload);
	const result = await createBranch(path, branch);
	cache.invalidate(path);
	return result;
}
/**
* Narrow a commit-detail request: absolute path + full object id.
* @param payload - the parsed request body.
*/
function parseCommitRequest(payload) {
	const record = payload;
	const path = parseRefsRequest(record);
	const hash = record?.hash;
	if (typeof hash !== "string" || hash === "") throw new WorkspaceGitError("bad-request", "hash must be a non-empty string");
	return {
		path,
		hash
	};
}
/**
* Resolve one commit's detail payload for the graph side panel.
* @param payload - the parsed request body.
*/
async function resolveCommit(payload) {
	const { path, hash } = parseCommitRequest(payload);
	return fetchCommitDetail(path, hash);
}
/**
* Build the route handler.
* @param cache - the activation-scoped branch cache.
* @param fence - browser-trust predicate.
* @returns the route handler.
*/
function createApiHandler(cache, fence) {
	return async (req, res) => {
		if (!fence(req)) {
			writeError(res, new WorkspaceGitError("forbidden", "forbidden", 403));
			return;
		}
		if (req.method !== "POST") {
			writeError(res, new WorkspaceGitError("method-error", "method not allowed", 405));
			return;
		}
		const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
		const method = pathname.startsWith(`/workspace-git/api/`) ? pathname.slice(19) : void 0;
		if (method === void 0 || method.includes("/")) {
			writeError(res, new WorkspaceGitError("bad-request", "unknown workspace-git API method", 404));
			return;
		}
		try {
			const payload = await readJsonBody(req);
			if (method === "branches") {
				writeOk(res, await resolveBranches(cache, payload));
				return;
			}
			if (method === "refs") {
				writeOk(res, await resolveRefs(cache, payload));
				return;
			}
			if (method === "graph") {
				writeOk(res, await resolveGraph(payload));
				return;
			}
			if (method === "commit") {
				writeOk(res, await resolveCommit(payload));
				return;
			}
			if (method === "checkout") {
				writeOk(res, await resolveCheckout(cache, payload));
				return;
			}
			if (method === "create-branch") {
				writeOk(res, await resolveCreateBranch(cache, payload));
				return;
			}
			throw new WorkspaceGitError("bad-request", `unknown workspace-git API method "${method}"`, 404);
		} catch (error) {
			writeError(res, error);
		}
	};
}
//#endregion
//#region src/trust-fence.ts
function header(request, name) {
	const value = request.headers[name];
	return typeof value === "string" ? value : void 0;
}
/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
/** Whether a normalized URL hostname names the local loopback authority. */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
/** Whether the request authority matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}
/**
* Decide whether one plugin request may reach the routes.
*
* @param request - node HTTP request facts (headers).
* @param trustedHosts - non-loopback authorities this deployment serves.
* @returns true when the Host is ours and browser markers are same-origin.
*/
function isTrustedApiRequest(request, trustedHosts) {
	const host = header(request, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).hostname === hostUrl.hostname;
	} catch {
		return false;
	}
}
//#endregion
//#region src/index.ts
/**
* dsh-workspace-git — host half.
*
* Owns exactly one fenced route, `POST /workspace-git/api/branches`, which
* answers "what branch is checked out in this directory?" for a batch of
* workspace paths. Branch detection reads `.git/HEAD` directly (see
* git-ref.ts / git-branch.ts) — no subprocess, no `git` binary requirement.
*
* Two properties are load-bearing for the whole plugin:
*
* - **Silence is a valid answer.** A path that is not a repository resolves to
*   `null`, identically to a path that is unreadable or has a corrupt HEAD. The
*   client draws nothing for `null`. There is no error placeholder anywhere in
*   this plugin, because "this folder is not a git repo" is the common case,
*   not a failure.
* - **The route is fenced.** Loopback Host header or a `--trusted-host`
*   authority, same rule as the /api gateway (see trust-fence.ts).
*
* The cache is per-activation and disposed with the fiber, so an HMR reload
* never leaves a stale map behind and never shares state across activations.
*/
/** Plugin identity for cordis.yml rows. */
const name = "dsh-workspace-git";
/** Services required before mounting: the webserver routes and the session store. */
const inject = ["webServer", "sessions"];
/**
* The web runtime's bind-derived trust list, read per request so a replaced
* list takes effect without a plugin restart. `webRuntime` is not in `inject`:
* it is provided by the web app bundle and probed optionally, so the plugin
* still mounts (with a loopback-only fence) on a host that lacks it.
* @param ctx - the host plugin context.
* @returns the trusted authorities, or an empty list.
*/
function trustedHostsOf(ctx) {
	return ctx.get("webRuntime")?.trustedHosts ?? [];
}
/**
* Plugin body: mount the fenced route and own the branch cache.
* @param ctx - host plugin context (webServer, sessions).
*/
function apply(ctx) {
	const cache = new BranchCache();
	ctx.effect(() => () => cache.dispose(), "dsh-workspace-git: branch cache");
	const fence = (req) => isTrustedApiRequest(req, trustedHostsOf(ctx));
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: API_PREFIX,
		handler: createApiHandler(cache, fence)
	}), "dsh-workspace-git: /workspace-git/api routes");
}
//#endregion
export { apply, inject, name };
