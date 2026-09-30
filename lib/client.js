window.__ModuleLoader__.load({
	id: "dsh-workspace-git",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/**
		* Typed fetch wrapper over the plugin's own `/workspace-git/api` route.
		*
		* Every call posts a batch of absolute workspace paths and receives a per-path
		* answer map. Failures surface as {@link WorkspaceGitApiError} — but callers
		* are expected to swallow them: the plugin's contract is that a failed lookup
		* renders nothing, never an error (see the header chip and the README).
		*/
		/** One wire failure. */
		var WorkspaceGitApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
			}
		};
		/**
		* Parse one response envelope into its value.
		* @param response - the fetch response.
		* @returns the envelope's value.
		* @throws WorkspaceGitApiError when the response is not a success envelope.
		*/
		async function readEnvelope(response) {
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) throw new WorkspaceGitApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? `HTTP ${response.status}`);
			return parsed.value;
		}
		/**
		* Resolve the branch of each given workspace path.
		*
		* An empty path list short-circuits without a request — the common case on a
		* page with no workspaces, and it keeps the caller free of a special case.
		* @param paths - absolute workspace directories.
		* @param signal - abort signal; an aborted request rejects with the DOMException.
		* @returns the per-path answer map.
		*/
		async function fetchBranches(paths, signal) {
			if (paths.length === 0) return { branches: {} };
			let response;
			try {
				response = await fetch("/workspace-git/api/branches", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ paths }),
					signal
				});
			} catch (error) {
				throw new WorkspaceGitApiError("network", error instanceof Error ? error.message : String(error));
			}
			return readEnvelope(response);
		}
		/**
		* Resolve the local branch list of one repository.
		*
		* Called only when the menu opens — the list is not needed to draw the closed
		* trigger, and a repository can hold hundreds of branches.
		* @param path - the absolute workspace directory.
		* @param signal - abort signal; an aborted request rejects with the DOMException.
		* @returns the branch list (empty for a directory that is not a repository).
		*/
		async function fetchRefs(path, signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/refs", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ path }),
					signal
				});
			} catch (error) {
				throw new WorkspaceGitApiError("network", error instanceof Error ? error.message : String(error));
			}
			return readEnvelope(response);
		}
		/**
		* Switch the work tree at `path` to the given local branch.
		* @param path - the absolute workspace directory.
		* @param branch - short local branch name.
		* @param signal - abort signal.
		* @returns the branch now checked out.
		*/
		async function checkoutBranch(path, branch, signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/checkout", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						path,
						branch
					}),
					signal
				});
			} catch (error) {
				throw new WorkspaceGitApiError("network", error instanceof Error ? error.message : String(error));
			}
			return readEnvelope(response);
		}
		//#endregion
		//#region src/client/store.ts
		/**
		* The client-side branch store: one activation-scoped cache of
		* `path -> branch`, plus the request scheduling that keeps the UI from
		* stampeding the host route.
		*
		* Design notes:
		*
		* - **Snapshot + subscribe, not React state.** The store is read through
		*   `useSyncExternalStore`, so a branch that arrives while a component is
		*   mounted re-renders it without any prop threading, and a lookup that never
		*   resolves simply leaves the snapshot at "unknown" — which renders as
		*   nothing.
		* - **Batched and coalesced.** Every `request(paths)` call folds its paths into
		*   one pending set and schedules a single microtask-later flush, so a row sync
		*   that discovers ten workspaces issues one request, not ten.
		* - **Backoff on failure.** A failed batch does not retry in a tight loop: the
		*   delay grows 3s → 10s → 30s and stays there. The UI shows nothing
		*   throughout, which is the intended behavior for "host route unavailable".
		* - **No negative-result caching beyond the host's own TTL.** The host already
		*   caches "not a repository" for a few seconds; the client only remembers what
		*   it has successfully resolved, so a fresh page load always re-asks.
		*/
		/** Retry delays after consecutive failures, in milliseconds (last value repeats). */
		const RETRY_DELAYS_MS = [
			3e3,
			1e4,
			3e4
		];
		/** An empty snapshot, shared so an empty store does not allocate per read. */
		const EMPTY = Object.freeze({});
		/**
		* One activation's branch store.
		*
		* Created once in the client `apply()` and closed over by every registration —
		* never a module-level singleton, matching the DSH store rule (a module
		* singleton would survive HMR and leak answers across activations).
		*/
		var BranchStore = class {
			snapshot = EMPTY;
			listeners = /* @__PURE__ */ new Set();
			pending = /* @__PURE__ */ new Set();
			flushScheduled = false;
			failures = 0;
			retryTimer;
			disposed = false;
			/**
			* The current snapshot. Reference-stable between changes, as
			* `useSyncExternalStore` requires.
			* @returns the path → answer map.
			*/
			getSnapshot = () => this.snapshot;
			/**
			* Subscribe to snapshot changes.
			* @param listener - invalidation callback.
			* @returns the unsubscribe callback.
			*/
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/**
			* The branch of one path, or undefined while unknown / not a repository.
			* @param path - the absolute workspace path.
			* @returns the answer, or undefined.
			*/
			branchOf(path) {
				return this.snapshot[path];
			}
			/**
			* Ask about a set of paths, skipping ones already answered.
			*
			* Safe to call on every render/sync: answered paths cost a map lookup, and
			* unanswered ones are coalesced into the next flush.
			* @param paths - absolute workspace paths.
			*/
			request(paths) {
				if (this.disposed) return;
				let added = false;
				for (const path of paths) {
					if (path === "" || this.snapshot[path] !== void 0 || this.pending.has(path)) continue;
					this.pending.add(path);
					added = true;
				}
				if (!added) return;
				if (this.retryTimer !== void 0) return;
				this.scheduleFlush();
			}
			/**
			* Forget everything and re-arm, so the next request re-resolves every path
			* (used when a workspace list changes and rows may have been re-pointed).
			*/
			invalidate() {
				if (this.disposed) return;
				this.snapshot = EMPTY;
				this.pending.clear();
				this.emit();
			}
			/**
			* Publish a known answer immediately (after a successful checkout).
			* @param path - absolute workspace path.
			* @param answer - the branch now checked out.
			*/
			publish(path, answer) {
				if (this.disposed || path === "" || answer.branch === null) return;
				this.snapshot = Object.freeze({
					...this.snapshot,
					[path]: answer
				});
				this.emit();
			}
			/** Stop all work; later calls are no-ops. */
			dispose() {
				this.disposed = true;
				this.pending.clear();
				this.listeners.clear();
				if (this.retryTimer !== void 0) {
					clearTimeout(this.retryTimer);
					this.retryTimer = void 0;
				}
			}
			/** Coalesce this tick's requests into one flush. */
			scheduleFlush() {
				if (this.flushScheduled || this.disposed) return;
				this.flushScheduled = true;
				Promise.resolve().then(() => {
					this.flushScheduled = false;
					this.flush();
				});
			}
			/** Issue one batch request for everything pending. */
			async flush() {
				if (this.disposed || this.pending.size === 0) return;
				const paths = [...this.pending];
				this.pending.clear();
				try {
					const { branches } = await fetchBranches(paths);
					if (this.disposed) return;
					this.failures = 0;
					let changed = false;
					const next = { ...this.snapshot };
					for (const path of paths) {
						const answer = branches[path] ?? {
							branch: null,
							detached: false
						};
						if (answer.branch === null) continue;
						next[path] = answer;
						changed = true;
					}
					if (changed) {
						this.snapshot = Object.freeze(next);
						this.emit();
					}
				} catch {
					if (this.disposed) return;
					const delay = RETRY_DELAYS_MS[Math.min(this.failures, RETRY_DELAYS_MS.length - 1)] ?? 3e4;
					this.failures += 1;
					for (const path of paths) this.pending.add(path);
					this.retryTimer = setTimeout(() => {
						this.retryTimer = void 0;
						this.scheduleFlush();
					}, delay);
				}
			}
			/** Notify subscribers. */
			emit() {
				for (const listener of this.listeners) try {
					listener();
				} catch {}
			}
		};
		//#endregion
		//#region src/client/BranchIcon.tsx
		/**
		* The branch glyph.
		* @param props - the drawn size.
		* @returns the icon element.
		*/
		function BranchIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				"data-workspace-git-icon": "",
				width: size,
				height: size,
				viewBox: "0 0 1024 1024",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				focusable: "false",
				style: {
					flex: "none",
					display: "block"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M746.666667 170.666667C664.32 170.666667 597.333333 237.653333 597.333333 320c0 66.304 43.733333 121.984 103.68 141.44-6.229333 39.765333-23.338667 72.533333-52.48 99.114667-83.029333 75.648-235.818667 82.56-307.2 81.365333V377.045333c61.44-18.517333 106.666667-74.965333 106.666667-142.378666C448 152.32 381.013333 85.333333 298.666667 85.333333S149.333333 152.32 149.333333 234.666667c0 67.413333 45.226667 123.861333 106.666667 142.378666v269.909334c-61.44 18.517333-106.666667 74.965333-106.666667 142.378666C149.333333 871.68 216.32 938.666667 298.666667 938.666667s149.333333-66.986667 149.333333-149.333334c0-23.509333-5.973333-45.44-15.658667-65.237333 87.893333-7.936 198.698667-32.298667 273.450667-100.266667 46.805333-42.538667 73.856-96.597333 81.237333-160.768C849.706667 445.354667 896 388.266667 896 320 896 237.653333 829.013333 170.666667 746.666667 170.666667z m-512 64C234.666667 199.381333 263.381333 170.666667 298.666667 170.666667s64 28.714667 64 64S333.952 298.666667 298.666667 298.666667s-64-28.714667-64-64zM298.666667 853.333333c-35.285333 0-64-28.714667-64-64a64 64 0 0 1 63.232-63.914666l5.546666 0.426666A63.786667 63.786667 0 0 1 298.666667 853.333333zM746.666667 384c-35.285333 0-64-28.714667-64-64S711.381333 256 746.666667 256s64 28.714667 64 64S781.952 384 746.666667 384z",
					fill: "currentColor"
				})
			});
		}
		//#endregion
		//#region src/client/GraphIcon.tsx
		/**
		* The git-graph glyph.
		* @param props - the drawn size.
		* @returns the icon element.
		*/
		function GraphIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				"data-workspace-git-graph-icon": "",
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				focusable: "false",
				style: {
					flex: "none",
					display: "block"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 1.5v13M8 1.5v13M12 1.5v5.5",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "4",
						cy: "4",
						r: "1.6",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "8",
						cy: "8",
						r: "1.6",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "4",
						r: "1.6",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "4",
						cy: "12",
						r: "1.6",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 4h4M8 8h4",
						stroke: "currentColor",
						strokeWidth: "1.2",
						strokeLinecap: "round"
					})
				]
			});
		}
		//#endregion
		//#region src/client/SearchIcon.tsx
		/**
		* The search glyph.
		* @param props - the drawn size.
		* @returns the icon element.
		*/
		function SearchIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				"data-workspace-git-search-icon": "",
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				focusable: "false",
				style: {
					flex: "none",
					display: "block"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z",
					fill: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z",
					fill: "currentColor"
				})]
			});
		}
		//#endregion
		//#region src/client/git-graph/dialogStyles.ts
		/**
		* Injected once: widens the Modal card for the commit graph and keeps it
		* viewport-bounded. The shared Modal defaults to 380px, which is too narrow
		* for a lane graph + commit table.
		*
		* Height is explicit on the dialog so the header/body flex split works: header
		* stays fixed full-width; only [data-git-graph-body] scrolls (scrollbar below
		* the header). Without a definite dialog height, flex:1 children collapse to 0.
		*
		* The graph split itself is a single-axis FLEX row (matching ui-trajectory) so
		* the commit list and the detail rail each own an independent scrollbar.
		*/
		const STYLE_ID$1 = "workspace-git-graph-dialog-css";
		const CSS$1 = `
.workspace-git-graph-dialog {
  width: min(1120px, calc(100vw - 48px)) !important;
  min-width: min(640px, calc(100vw - 48px)) !important;
  height: min(720px, calc(100vh - 48px)) !important;
  max-height: calc(100vh - 48px) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}
.workspace-git-graph-dialog .workspace-git-graph-modal {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
/* Modal body (header + body siblings under .content) */
.workspace-git-graph-dialog .workspace-git-graph-modal > :last-child {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  margin-top: 8px !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-root] {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  width: 100% !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-split] {
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
}
.workspace-git-graph-dialog [data-workspace-git-graph-split] > * {
  min-width: 0 !important;
  min-height: 0 !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-pane] {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
.workspace-git-graph-dialog [data-workspace-git-graph-list] {
  flex: 1 1 0% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
.workspace-git-graph-dialog [data-git-graph-header] {
  flex: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  overflow: hidden !important;
  line-height: 30px !important;
  font: var(--dsw-font-xxs-12, 12px/16px sans-serif) !important;
  border-bottom: 1px solid var(--dsw-alias-border-l2) !important;
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2)) !important;
  color: var(--dsw-alias-label-tertiary) !important;
}
.workspace-git-graph-dialog [data-git-graph-header] > * {
  box-sizing: border-box !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  line-height: 30px !important;
  overflow: hidden !important;
}
/* Scroll host 1: the commit list. */
.workspace-git-graph-dialog [data-git-graph-body] {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow: auto !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
}
.workspace-git-graph-dialog [data-workspace-git-graph-detail] {
  display: flex !important;
  flex-direction: column !important;
  flex: none !important;
  align-self: stretch !important;
  min-height: 0 !important;
  overflow: hidden !important;
}
@container (max-width: 900px) {
  .workspace-git-graph-dialog [data-workspace-git-graph-detail] {
    width: var(--dsh-git-graph-detail-narrow-width, min(320px, 42%)) !important;
    max-width: 62% !important;
  }
}
/* Scroll host 2: the commit detail. Independent of scroll host 1. */
.workspace-git-graph-dialog [data-workspace-git-graph-detail-scroll] {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow: auto !important;
  scrollbar-gutter: stable;
}
@media (max-width: 720px) {
  .workspace-git-graph-dialog [data-git-graph-meta] {
    display: none !important;
  }
  .workspace-git-graph-dialog [data-git-graph-cols] {
    grid-template-columns: minmax(0, 1fr) 72px !important;
  }
}
`;
		/** Ensure the graph-dialog CSS is in document.head (idempotent). */
		function ensureGitGraphDialogStyles() {
			if (typeof document === "undefined") return;
			const existing = document.getElementById(STYLE_ID$1);
			if (existing !== null) {
				existing.textContent = CSS$1;
				return;
			}
			const style = document.createElement("style");
			style.id = STYLE_ID$1;
			style.textContent = CSS$1;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/git-graph/api.ts
		/**
		* Client fetch for one page of the commit graph.
		*/
		/**
		* Fetch one page of commits for the graph dialog.
		*/
		async function fetchCommitGraph(path, maxCount = 50, skip = 0, signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/graph", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						path,
						maxCount,
						skip
					}),
					signal
				});
			} catch (error) {
				throw new WorkspaceGitApiError("network", error instanceof Error ? error.message : String(error));
			}
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) throw new WorkspaceGitApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? `HTTP ${response.status}`);
			return parsed.value;
		}
		/**
		* Fetch one commit's detail for the right-hand panel.
		* @param path - absolute workspace path.
		* @param hash - full commit hash.
		* @param signal - optional abort.
		*/
		async function fetchCommitDetail(path, hash, signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/commit", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						path,
						hash
					}),
					signal
				});
			} catch (error) {
				throw new WorkspaceGitApiError("network", error instanceof Error ? error.message : String(error));
			}
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) throw new WorkspaceGitApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? `HTTP ${response.status}`);
			return parsed.value;
		}
		//#endregion
		//#region src/client/git-graph/fileTree.ts
		function sortNodes(nodes) {
			nodes.sort((a, b) => {
				if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
			for (const node of nodes) if (node.kind === "dir") sortNodes(node.children);
		}
		function recount(node) {
			if (node.kind === "file") {
				node.fileCount = 1;
				return 1;
			}
			let total = 0;
			for (const child of node.children) total += recount(child);
			node.fileCount = total;
			return total;
		}
		/**
		* @param files - relative paths from `git diff-tree --name-only`.
		* @returns sorted root children of the tree.
		*/
		function buildFileTree(files) {
			const root = {
				name: "",
				path: "",
				kind: "dir",
				children: [],
				fileCount: 0
			};
			for (const raw of files) {
				const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "").trim();
				if (normalized === "") continue;
				const parts = normalized.split("/").filter(Boolean);
				let current = root;
				let prefix = "";
				for (let i = 0; i < parts.length; i += 1) {
					const part = parts[i];
					prefix = prefix === "" ? part : `${prefix}/${part}`;
					const isFile = i === parts.length - 1;
					let next = current.children.find((child) => child.name === part);
					if (next === void 0) {
						next = {
							name: part,
							path: prefix,
							kind: isFile ? "file" : "dir",
							children: [],
							fileCount: 0
						};
						current.children.push(next);
					} else if (isFile) next.kind = "file";
					else if (next.kind === "file") next.kind = "dir";
					current = next;
				}
			}
			sortNodes(root.children);
			for (const child of root.children) recount(child);
			return root.children;
		}
		//#endregion
		//#region src/client/git-graph/FileKindIcon.tsx
		function glyphFor(kind, name) {
			if (kind === "dir") return "folder";
			const lower = name.toLowerCase();
			const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
			if ([
				"ts",
				"tsx",
				"js",
				"jsx",
				"mjs",
				"cjs",
				"vue",
				"svelte",
				"py",
				"go",
				"rs",
				"java",
				"kt",
				"swift",
				"c",
				"cpp",
				"h",
				"hpp"
			].includes(ext)) return "code";
			if ([
				"json",
				"jsonc",
				"yml",
				"yaml",
				"toml",
				"ini",
				"env",
				"xml",
				"plist"
			].includes(ext) || lower === "dockerfile" || lower.startsWith("dockerfile.") || lower === ".gitignore" || lower === ".npmrc" || lower === ".editorconfig") return "config";
			if ([
				"css",
				"scss",
				"sass",
				"less",
				"styl"
			].includes(ext)) return "style";
			if ([
				"png",
				"jpg",
				"jpeg",
				"gif",
				"svg",
				"webp",
				"ico",
				"bmp"
			].includes(ext)) return "image";
			if ([
				"md",
				"mdx",
				"txt",
				"rst",
				"adoc"
			].includes(ext)) return "doc";
			if (["lock", "sum"].includes(ext) || lower.endsWith("-lock.json") || lower === "pnpm-lock.yaml" || lower === "yarn.lock") return "lock";
			return "file";
		}
		function colorFor(glyph) {
			switch (glyph) {
				case "folder": return "#e3b341";
				case "code": return "#3b82f6";
				case "config": return "#a855f7";
				case "style": return "#ec4899";
				case "image": return "#22c55e";
				case "doc": return "#64748b";
				case "lock": return "#f59e0b";
				default: return "var(--dsw-alias-label-tertiary)";
			}
		}
		/**
		* @returns a 14px-ish svg glyph tinted by kind.
		*/
		function FileKindIcon({ kind, name, size = 14 }) {
			const glyph = glyphFor(kind, name);
			const common = {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": true,
				focusable: false,
				style: {
					flex: "none",
					display: "block",
					color: colorFor(glyph)
				}
			};
			if (glyph === "folder") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...common,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M1.5 4.5A1.5 1.5 0 0 1 3 3h3.2l1.2 1.2H13A1.5 1.5 0 0 1 14.5 5.7v6.8A1.5 1.5 0 0 1 13 14H3A1.5 1.5 0 0 1 1.5 12.5v-8Z",
					fill: "currentColor"
				})
			});
			if (glyph === "code") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...common,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5.4 4.2 1.8 8l3.6 3.8.9-.9L3.7 8l2.6-2.9-.9-.9Zm5.2 0-.9.9L12.3 8l-2.6 2.9.9.9L14.2 8l-3.6-3.8Z",
					fill: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M9.1 3.2 6.6 12.8h1.1l2.5-9.6H9.1Z",
					fill: "currentColor",
					opacity: .7
				})]
			});
			if (glyph === "config") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...common,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 3.2a1.2 1.2 0 0 1 1.15.86l.12.4.38.16a4.8 4.8 0 0 1 .7.36l.35-.2.36.2-.2.35c.14.22.26.45.36.7l.4.12A1.2 1.2 0 0 1 12.8 8a1.2 1.2 0 0 1-.86 1.15l-.4.12c-.1.25-.22.48-.36.7l.2.35-.2.36-.35-.2a4.8 4.8 0 0 1-.7.36l-.12.4A1.2 1.2 0 0 1 8 12.8a1.2 1.2 0 0 1-1.15-.86l-.12-.4a4.8 4.8 0 0 1-.7-.36l-.35.2-.36-.2.2-.35a4.8 4.8 0 0 1-.36-.7l-.4-.12A1.2 1.2 0 0 1 3.2 8a1.2 1.2 0 0 1 .86-1.15l.4-.12c.1-.25.22-.48.36-.7l-.2-.35.2-.36.35.2c.22-.14.45-.26.7-.36l.12-.4A1.2 1.2 0 0 1 8 3.2Zm0 3.1A1.7 1.7 0 1 0 8 9.7 1.7 1.7 0 0 0 8 6.3Z",
					fill: "currentColor"
				})
			});
			if (glyph === "style") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...common,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3 2.5h10l-1.2 9.2L8 14.2 4.2 11.7 3 2.5Zm2 .9.9 7.1L8 12.5l2.1-1.9.9-7.1H5Z",
					fill: "currentColor"
				})
			});
			if (glyph === "image") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...common,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.5 3.5A1.5 1.5 0 0 1 4 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 12 14H4A1.5 1.5 0 0 1 2.5 12.5v-9ZM4 3.2a.3.3 0 0 0-.3.3v7.4l2.4-2.4 1.6 1.6 2.8-2.8 2.8 2.8V3.5a.3.3 0 0 0-.3-.3H4Zm2.2 2.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z",
					fill: "currentColor"
				})
			});
			if (glyph === "doc") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...common,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4 2.5h5.2L12.5 5.8V13.5A1 1 0 0 1 11.5 14.5h-7A1 1 0 0 1 3.5 13.5v-10A1 1 0 0 1 4.5 2.5H4Zm5 .8V6h2.6L9 3.3ZM5.2 8h5.6v1H5.2V8Zm0 2h5.6v1H5.2v-1Zm0 2h3.8v1H5.2v-1Z",
					fill: "currentColor"
				})
			});
			if (glyph === "lock") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...common,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5.2 6.2V5a2.8 2.8 0 0 1 5.6 0v1.2h.9A1.3 1.3 0 0 1 13 7.5v5.2A1.3 1.3 0 0 1 11.7 14H4.3A1.3 1.3 0 0 1 3 12.7V7.5a1.3 1.3 0 0 1 1.3-1.3h.9Zm1.2 0h3.2V5a1.6 1.6 0 0 0-3.2 0v1.2Z",
					fill: "currentColor"
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...common,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4 2.5h5.2L12.5 5.8V13.5A1 1 0 0 1 11.5 14.5h-7A1 1 0 0 1 3.5 13.5v-10A1 1 0 0 1 4.5 2.5H4Zm5 .8V6h2.6L9 3.3Z",
					fill: "currentColor"
				})
			});
		}
		//#endregion
		//#region src/client/git-graph/GitGraphDetailPanel.tsx
		/**
		* Right-hand commit detail: message block + nested changed-file tree.
		* Mounted only while a commit is selected; includes an explicit close control.
		*/
		function formatTime$1(ms) {
			if (ms === null) return "";
			try {
				return new Intl.DateTimeFormat(void 0, {
					year: "numeric",
					month: "numeric",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit"
				}).format(new Date(ms));
			} catch {
				return "";
			}
		}
		const sectionTitle = {
			margin: "0 0 8px",
			fontSize: "12px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-secondary)"
		};
		const metaRow = {
			margin: "0 0 6px",
			fontSize: "12px",
			lineHeight: "18px",
			color: "var(--dsw-alias-label-primary)",
			wordBreak: "break-word"
		};
		function TreeNodeView({ node, depth }) {
			const [open, setOpen] = (0, react.useState)(depth < 2);
			const rowBase = {
				display: "flex",
				alignItems: "center",
				gap: 6,
				minHeight: 22,
				paddingLeft: 10 + depth * 16,
				paddingRight: 8,
				boxSizing: "border-box",
				fontSize: "12px",
				lineHeight: "20px",
				fontWeight: 400,
				color: "var(--dsw-alias-label-primary)"
			};
			if (node.kind === "file") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowBase,
				title: node.path,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
						width: 10,
						flex: "none"
					} }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileKindIcon, {
						kind: "file",
						name: node.name,
						size: 14
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							fontWeight: 400,
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
						},
						children: node.name
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => {
					setOpen((value) => !value);
				},
				style: {
					...rowBase,
					width: "100%",
					border: "none",
					background: "transparent",
					cursor: "pointer",
					fontSize: "12px",
					fontWeight: 0,
					lineHeight: "20px",
					textAlign: "left"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						style: {
							width: 10,
							flex: "none",
							color: "var(--dsw-alias-label-tertiary)",
							fontSize: 10,
							lineHeight: "14px",
							textAlign: "center"
						},
						children: open ? "▾" : "▸"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileKindIcon, {
						kind: "dir",
						name: node.name,
						size: 14
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							fontSize: "12px",
							fontWeight: 0
						},
						children: [node.name, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								color: "var(--dsw-alias-label-tertiary)",
								marginLeft: 6,
								fontSize: "12px",
								fontWeight: 0
							},
							children: [
								"(",
								node.fileCount,
								")"
							]
						})]
					})
				]
			}), open ? node.children.map((child) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TreeNodeView, {
				node: child,
				depth: depth + 1
			}, child.path)) : null] });
		}
		/**
		* Detail panel for one selected commit.
		*/
		function GitGraphDetailPanel({ cwd, hash, onClose, width = "clamp(320px, 38%, 440px)", maxWidth = "calc(100% - 280px)", narrowWidth = "min(320px, 42%)", labels }) {
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [detail, setDetail] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let cancelled = false;
				setLoading(true);
				setError(null);
				fetchCommitDetail(cwd, hash).then((result) => {
					if (!cancelled) setDetail(result);
				}).catch((err) => {
					if (!cancelled) {
						setDetail(null);
						setError(err instanceof Error ? err.message : String(err));
					}
				}).finally(() => {
					if (!cancelled) setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [cwd, hash]);
			const tree = (0, react.useMemo)(() => detail === null ? [] : buildFileTree(detail.files), [detail]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				"data-workspace-git-graph-detail": "",
				style: {
					display: "flex",
					flexDirection: "column",
					flex: "none",
					width,
					maxWidth,
					minWidth: 0,
					minHeight: 0,
					alignSelf: "stretch",
					overflow: "hidden",
					borderLeft: "1px solid var(--dsw-alias-border-l2)",
					background: "var(--dsw-alias-bg-layer-1)",
					["--dsh-git-graph-detail-narrow-width"]: narrowWidth
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
						flex: "none",
						height: 30,
						fontWeight: 400,
						padding: "0 6px 0 8px",
						borderBottom: "1px solid var(--dsw-alias-border-l2)",
						boxSizing: "border-box",
						background: "var(--dsw-alias-bg-layer-1)"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							font: "var(--dsw-font-xxs-12, 12px/16px sans-serif)",
							fontWeight: 400,
							color: "var(--dsw-alias-label-secondary)",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: labels.commitInfo
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-workspace-git-graph-detail-close": "",
						"aria-label": labels.close,
						title: labels.close,
						onClick: onClose,
						style: {
							flex: "none",
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							width: 20,
							height: 20,
							border: "none",
							borderRadius: 3,
							background: "transparent",
							color: "var(--dsw-alias-label-tertiary)",
							cursor: "pointer",
							fontSize: 14,
							lineHeight: "14px",
							padding: 0
						},
						onMouseEnter: (e) => {
							e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
							e.currentTarget.style.color = "var(--dsw-alias-label-primary)";
						},
						onMouseLeave: (e) => {
							e.currentTarget.style.background = "transparent";
							e.currentTarget.style.color = "var(--dsw-alias-label-tertiary)";
						},
						children: "×"
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					"data-workspace-git-graph-detail-scroll": "",
					style: {
						display: loading || error !== null || detail === null ? "flex" : "block",
						flex: "1 1 0%",
						minHeight: 0,
						alignItems: "center",
						justifyContent: "center",
						overflow: "auto",
						overscrollBehavior: "contain",
						scrollbarGutter: "stable"
					},
					children: loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: "var(--dsw-alias-label-tertiary)",
							fontSize: 13
						},
						children: labels.loading
					}) : error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							padding: 16,
							color: "var(--dsw-alias-state-error-primary)",
							fontSize: 13,
							textAlign: "center"
						},
						children: [
							labels.error,
							": ",
							error
						]
					}) : detail === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							padding: "12px 14px",
							borderBottom: "1px solid var(--dsw-alias-border-l2)"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...metaRow,
									whiteSpace: "pre-wrap",
									marginBottom: 10,
									fontSize: 13,
									lineHeight: "20px"
								},
								children: detail.body !== "" ? `${detail.subject}\n\n${detail.body}` : detail.subject
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								style: metaRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: { color: "var(--dsw-alias-label-tertiary)" },
										children: [labels.author, ": "]
									}),
									detail.authorName ?? "",
									detail.authorEmail !== null ? ` <${detail.authorEmail}>` : ""
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								style: metaRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: { color: "var(--dsw-alias-label-tertiary)" },
									children: [labels.time, ": "]
								}), formatTime$1(detail.authoredAtMs)]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								style: metaRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: { color: "var(--dsw-alias-label-tertiary)" },
									children: [labels.branches, ": "]
								}), detail.refs.length === 0 ? "—" : `${labels.inBranches(detail.refs.length)} ${detail.refs.join(", ")}`]
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { padding: "12px 14px" },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
							style: {
								...sectionTitle,
								fontSize: "12px",
								fontWeight: 0
							},
							children: [labels.files, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: "12px",
									fontWeight: 0,
									color: "var(--dsw-alias-label-tertiary)",
									marginLeft: 6
								},
								children: labels.filesCount(detail.files.length)
							})]
						}), tree.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: "var(--dsw-alias-label-tertiary)",
								fontSize: 12
							},
							children: "—"
						}) : tree.map((node) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TreeNodeView, {
							node,
							depth: 0
						}, node.path))]
					})] })
				})]
			});
		}
		//#endregion
		//#region src/client/git-graph/layoutAlgorithm.ts
		const MISSING_PARENT_ID = -1;
		var LayoutBranch = class {
			colourIndex;
			lines = [];
			endRowIndex = 0;
			constructor(colourIndex) {
				this.colourIndex = colourIndex;
			}
			addLine(from, to, sourceHash, targetHash, lockedFirst) {
				this.lines.push({
					from,
					to,
					laneIndex: this.colourIndex,
					sourceHash,
					targetHash,
					lockedFirst
				});
			}
		};
		var LayoutVertex = class {
			id;
			hash;
			parents = [];
			nextParentIndex = 0;
			laneIndex = null;
			branch = null;
			nextLaneIndex = 0;
			connections = [];
			constructor(id, hash) {
				this.id = id;
				this.hash = hash;
			}
			addParent(vertex) {
				this.parents.push(vertex);
			}
			getNextParent() {
				return this.nextParentIndex < this.parents.length ? this.parents[this.nextParentIndex] : null;
			}
			registerParentProcessed() {
				this.nextParentIndex++;
			}
			isMerge() {
				return this.parents.length > 1;
			}
			isNotOnBranch() {
				return this.branch === null || this.laneIndex === null;
			}
			addToBranch(branch, laneIndex) {
				if (this.branch === null) {
					this.branch = branch;
					this.laneIndex = laneIndex;
				}
			}
			getBranch() {
				return this.branch;
			}
			getLaneIndex() {
				return this.laneIndex ?? 0;
			}
			getPoint() {
				return {
					laneIndex: this.getLaneIndex(),
					rowIndex: this.id
				};
			}
			getNextPoint() {
				return {
					laneIndex: this.nextLaneIndex,
					rowIndex: this.id
				};
			}
			getPointConnectingTo(target, branch) {
				const connectionIndex = this.connections.findIndex((connection) => connection?.target === target && connection.branch === branch);
				return connectionIndex >= 0 ? {
					laneIndex: connectionIndex,
					rowIndex: this.id
				} : null;
			}
			reservePoint(laneIndex, target, branch) {
				if (laneIndex === this.nextLaneIndex) {
					this.connections[laneIndex] = {
						target,
						branch
					};
					this.nextLaneIndex = laneIndex + 1;
				}
			}
			getWidthLaneIndex() {
				return this.nextLaneIndex;
			}
		};
		function createVertices(commits) {
			const missingParent = new LayoutVertex(MISSING_PARENT_ID, "__zcode_missing_parent__");
			const vertices = commits.map((commit, index) => new LayoutVertex(index, commit.hash));
			const vertexByHash = new Map(vertices.map((vertex) => [vertex.hash, vertex]));
			for (const [index, commit] of commits.entries()) {
				const vertex = vertices[index];
				for (const parentHash of commit.parents) {
					const parent = vertexByHash.get(parentHash) ?? missingParent;
					vertex.addParent(parent);
				}
			}
			return {
				missingParent,
				vertices,
				vertexByHash
			};
		}
		function getAvailableColour(startAt, availableColours) {
			const reusableColour = availableColours.findIndex((endAt) => startAt > endAt);
			if (reusableColour >= 0) return reusableColour;
			availableColours.push(0);
			return availableColours.length - 1;
		}
		function determineMergePath(startAt, vertices, vertex, parentVertex) {
			const parentBranch = parentVertex.getBranch();
			let lastPoint = vertex.getPoint();
			let foundConnectionToParent = false;
			for (let rowIndex = startAt + 1; rowIndex < vertices.length; rowIndex++) {
				const currentVertex = vertices[rowIndex];
				const existingPoint = currentVertex.getPointConnectingTo(parentVertex, parentBranch);
				const currentPoint = existingPoint ?? currentVertex.getNextPoint();
				foundConnectionToParent = existingPoint !== null;
				parentBranch.addLine(lastPoint, currentPoint, vertex.hash, parentVertex.hash, !foundConnectionToParent && currentVertex !== parentVertex ? lastPoint.laneIndex < currentPoint.laneIndex : true);
				currentVertex.reservePoint(currentPoint.laneIndex, parentVertex, parentBranch);
				lastPoint = currentPoint;
				if (foundConnectionToParent) {
					vertex.registerParentProcessed();
					break;
				}
			}
		}
		function determineNormalPath(params) {
			const { startAt, vertices, branches, availableColours, missingParent } = params;
			let rowIndex = startAt;
			let vertex = vertices[rowIndex];
			let parentVertex = vertex.getNextParent();
			let lastPoint = vertex.isNotOnBranch() ? vertex.getNextPoint() : vertex.getPoint();
			const branch = new LayoutBranch(getAvailableColour(startAt, availableColours));
			vertex.addToBranch(branch, lastPoint.laneIndex);
			vertex.reservePoint(lastPoint.laneIndex, vertex, branch);
			for (rowIndex = startAt + 1; rowIndex < vertices.length; rowIndex++) {
				if (parentVertex === null || parentVertex === missingParent) break;
				const currentVertex = vertices[rowIndex];
				const currentPoint = parentVertex === currentVertex && !parentVertex.isNotOnBranch() ? currentVertex.getPoint() : currentVertex.getNextPoint();
				branch.addLine(lastPoint, currentPoint, vertex.hash, parentVertex.hash, lastPoint.laneIndex < currentPoint.laneIndex);
				currentVertex.reservePoint(currentPoint.laneIndex, parentVertex, branch);
				lastPoint = currentPoint;
				if (parentVertex === currentVertex) {
					vertex.registerParentProcessed();
					const parentWasAlreadyOnBranch = !parentVertex.isNotOnBranch();
					parentVertex.addToBranch(branch, currentPoint.laneIndex);
					vertex = parentVertex;
					parentVertex = vertex.getNextParent();
					if (parentVertex === missingParent) {
						vertex.registerParentProcessed();
						break;
					}
					if (parentVertex === null || parentWasAlreadyOnBranch) break;
				}
			}
			branch.endRowIndex = rowIndex;
			branches.push(branch);
			availableColours[branch.colourIndex] = rowIndex;
		}
		function determinePath(params) {
			const vertex = params.vertices[params.startAt];
			const parentVertex = vertex.getNextParent();
			if (parentVertex === params.missingParent) {
				vertex.registerParentProcessed();
				return;
			}
			if (parentVertex !== null && vertex.isMerge() && !vertex.isNotOnBranch() && !parentVertex.isNotOnBranch()) {
				determineMergePath(params.startAt, params.vertices, vertex, parentVertex);
				return;
			}
			determineNormalPath(params);
		}
		function createGitGraphLayoutModel(commits) {
			const { missingParent, vertices, vertexByHash } = createVertices(commits);
			const branches = [];
			const availableColours = [];
			let index = 0;
			while (index < vertices.length) {
				const vertex = vertices[index];
				if (vertex.getNextParent() !== null || vertex.isNotOnBranch()) determinePath({
					startAt: index,
					vertices,
					branches,
					availableColours,
					missingParent
				});
				else index++;
			}
			return {
				vertices,
				vertexByHash,
				branchLines: branches.flatMap((branch) => branch.lines)
			};
		}
		//#endregion
		//#region src/client/git-graph/layout.ts
		const DEFAULT_ROW_HEIGHT = 35;
		const DEFAULT_LANE_GAP = 18;
		const DEFAULT_LANE_PADDING = 16;
		const DEFAULT_TOP_PADDING = 20;
		const DEFAULT_BOTTOM_PADDING = 18;
		function buildEdgePath({ fromX, fromY, toX, toY, lockedFirst }) {
			if (fromX === toX) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
			const curveOffset = Math.max(14, Math.abs(toY - fromY) * .38);
			if (lockedFirst === false) return [`M ${fromX} ${fromY}`, `C ${fromX} ${toY - curveOffset}, ${toX} ${toY - curveOffset}, ${toX} ${toY}`].join(" ");
			return [`M ${fromX} ${fromY}`, `C ${fromX} ${fromY + curveOffset}, ${toX} ${fromY + curveOffset}, ${toX} ${toY}`].join(" ");
		}
		function pointToPixels(point, options) {
			return {
				x: options.lanePadding + point.laneIndex * options.laneGap,
				y: options.topPadding + point.rowIndex * options.rowHeight
			};
		}
		function createGraphPath(line, lineIndex, pixelOptions) {
			const from = pointToPixels(line.from, pixelOptions);
			const to = pointToPixels(line.to, pixelOptions);
			return {
				id: `${line.sourceHash}:${line.targetHash}:${line.from.rowIndex}:${line.to.rowIndex}:${lineIndex}:path`,
				laneIndex: line.laneIndex,
				path: buildEdgePath({
					fromX: from.x,
					fromY: from.y,
					toX: to.x,
					toY: to.y,
					lockedFirst: line.lockedFirst
				}),
				relatedHashes: line.sourceHash === line.targetHash ? [line.sourceHash] : [line.sourceHash, line.targetHash]
			};
		}
		function createLaneSegment(line, lineIndex, pixelOptions) {
			const from = pointToPixels(line.from, pixelOptions);
			const to = pointToPixels(line.to, pixelOptions);
			return {
				id: `${line.sourceHash}:${line.targetHash}:${line.from.rowIndex}:${line.to.rowIndex}:${lineIndex}:segment`,
				hash: line.targetHash,
				laneIndex: line.to.laneIndex,
				path: buildEdgePath({
					fromX: from.x,
					fromY: from.y,
					toX: to.x,
					toY: to.y,
					lockedFirst: line.lockedFirst
				})
			};
		}
		function createEdges(params) {
			const { commits, rows, vertexByHash, rowByHash, pixelOptions } = params;
			return commits.flatMap((commit, rowIndex) => {
				const fromVertex = vertexByHash.get(commit.hash);
				return commit.parents.map((parentHash, parentIndex) => {
					const parentVertex = vertexByHash.get(parentHash) ?? null;
					const fromLaneIndex = fromVertex.getLaneIndex();
					const toLaneIndex = parentVertex ? parentVertex.getLaneIndex() : fromLaneIndex + parentIndex;
					const fromRow = rows[rowIndex];
					const toRow = rowByHash.get(parentHash);
					const fromX = pixelOptions.lanePadding + fromLaneIndex * pixelOptions.laneGap;
					const toX = pixelOptions.lanePadding + toLaneIndex * pixelOptions.laneGap;
					return {
						id: `${commit.hash}:${parentHash}:${parentIndex}`,
						fromHash: commit.hash,
						toHash: parentHash,
						fromLaneIndex,
						toLaneIndex,
						path: buildEdgePath({
							fromX,
							fromY: fromRow.y,
							toX,
							toY: toRow?.y ?? fromRow.y,
							lockedFirst: fromLaneIndex < toLaneIndex
						}),
						truncated: !toRow
					};
				});
			});
		}
		function layoutGitGraph(commits, options = {}) {
			const rowHeight = options.rowHeight ?? DEFAULT_ROW_HEIGHT;
			const laneGap = options.laneGap ?? DEFAULT_LANE_GAP;
			const lanePadding = options.lanePadding ?? DEFAULT_LANE_PADDING;
			const topPadding = options.topPadding ?? DEFAULT_TOP_PADDING;
			const bottomPadding = options.bottomPadding ?? DEFAULT_BOTTOM_PADDING;
			const { vertices, vertexByHash, branchLines } = createGitGraphLayoutModel(commits);
			const rows = vertices.map((vertex, rowIndex) => {
				const laneIndex = vertex.getLaneIndex();
				return {
					commit: commits[rowIndex],
					rowIndex,
					laneIndex,
					x: lanePadding + laneIndex * laneGap,
					y: topPadding + rowIndex * rowHeight
				};
			});
			const rowByHash = new Map(rows.map((row) => [row.commit.hash, row]));
			const maxRowLaneIndex = rows.reduce((max, row) => Math.max(max, row.laneIndex), 0);
			const maxWidthLaneIndex = vertices.reduce((max, vertex) => Math.max(max, vertex.getWidthLaneIndex() - 1), 0);
			const maxLineLaneIndex = branchLines.reduce((max, line) => Math.max(max, line.from.laneIndex, line.to.laneIndex), 0);
			const laneCount = Math.max(1, maxRowLaneIndex + 1, maxWidthLaneIndex + 1, maxLineLaneIndex + 1);
			const height = topPadding + Math.max(0, commits.length - 1) * rowHeight + bottomPadding;
			const width = lanePadding * 2 + (laneCount - 1) * laneGap;
			const pixelOptions = {
				lanePadding,
				laneGap,
				topPadding,
				rowHeight
			};
			const verticalLines = branchLines.filter((line) => line.from.laneIndex === line.to.laneIndex);
			return {
				rows,
				edges: createEdges({
					commits,
					rows,
					vertexByHash,
					rowByHash,
					pixelOptions
				}),
				laneSegments: verticalLines.map((line, index) => createLaneSegment(line, index, pixelOptions)),
				paths: branchLines.map((line, index) => createGraphPath(line, index, pixelOptions)),
				laneCount,
				width,
				height,
				rowHeight,
				laneGap
			};
		}
		//#endregion
		//#region src/client/git-graph/GitGraphPane.tsx
		/**
		* Commit-graph pane: SVG lane graph + aligned commit rows.
		* Layout algorithm ported from ZCode's packages/ui git-graph; styling uses
		* `--dsw-*` tokens so it matches the DSH shell without Tailwind.
		*
		* Width follows the dialog (min 500px via dialogStyles); the table drops the
		* date/author columns under 720px viewport so the description stays readable.
		*/
		const LANE_COLORS = [
			"#3b82f6",
			"#a855f7",
			"#22c55e",
			"#f59e0b",
			"#ef4444",
			"#06b6d4"
		];
		const NODE_RADIUS = 4;
		const SELECTED_RING = 5.5;
		const GRAPH_COLUMN_MIN = 56;
		const LOAD_MORE_THRESHOLD = 96;
		/** Fluid commit-table columns (description grows; meta columns can shrink). */
		const TABLE_COLS = "minmax(0, 1fr) minmax(64px, 110px) minmax(56px, 100px) 72px";
		function shortHash(hash) {
			return hash.slice(0, 7);
		}
		function formatTime(ms) {
			if (ms === null) return "";
			try {
				return new Intl.DateTimeFormat(void 0, {
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit"
				}).format(new Date(ms));
			} catch {
				return "";
			}
		}
		function laneColor(index) {
			return LANE_COLORS[index % LANE_COLORS.length];
		}
		function isRelated(path, hash) {
			return Boolean(hash && path.relatedHashes.includes(hash));
		}
		/**
		* Render the graph + commit table.
		* @param props - commits and interaction callbacks.
		* @returns the pane.
		*/
		function GitGraphPane({ commits, hasMore = false, loadingMore = false, selectedCommitHash, onSelectCommit, onLoadMore, labels }) {
			const [hovered, setHovered] = (0, react.useState)(null);
			const layout = (0, react.useMemo)(() => layoutGitGraph(commits, { rowHeight: 30 }), [commits]);
			const graphWidth = Math.max(layout.width + 12, GRAPH_COLUMN_MIN);
			const onScroll = (0, react.useCallback)((event) => {
				if (!hasMore || loadingMore || !onLoadMore) return;
				const target = event.currentTarget;
				if (target.scrollHeight - target.scrollTop - target.clientHeight <= LOAD_MORE_THRESHOLD) onLoadMore();
			}, [
				hasMore,
				loadingMore,
				onLoadMore
			]);
			const shellStyle = {
				display: "grid",
				gridTemplateColumns: `${graphWidth}px minmax(0, 1fr)`,
				width: "100%",
				minWidth: 0
			};
			const colsStyle = {
				display: "grid",
				gridTemplateColumns: TABLE_COLS,
				minWidth: 0
			};
			if (commits.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					minHeight: "240px",
					color: "var(--dsw-alias-label-tertiary)",
					fontSize: "14px"
				},
				children: labels.empty
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-workspace-git-graph-pane": "",
				style: {
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
					flex: 1,
					overflow: "hidden",
					width: "100%"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-git-graph-header": "",
					style: {
						...shellStyle,
						flex: "none",
						boxSizing: "border-box",
						borderBottom: "1px solid var(--dsw-alias-border-l2)",
						font: "var(--dsw-font-xxs-12, 12px/16px sans-serif)",
						overflow: "hidden",
						color: "var(--dsw-alias-label-tertiary)",
						background: "var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2))",
						alignItems: "center"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							boxSizing: "border-box",
							padding: "0 8px",
							borderRight: "1px solid var(--dsw-alias-border-l2)",
							display: "flex",
							alignItems: "center",
							overflow: "hidden"
						},
						children: labels.graph
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"data-git-graph-cols": "",
						style: {
							...colsStyle,
							boxSizing: "border-box",
							alignItems: "center",
							overflow: "hidden"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									padding: "0 8px",
									overflow: "hidden"
								},
								children: labels.description
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"data-git-graph-meta": "",
								style: {
									padding: "0 8px",
									overflow: "hidden"
								},
								children: labels.date
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"data-git-graph-meta": "",
								style: {
									padding: "0 8px",
									overflow: "hidden"
								},
								children: labels.author
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									padding: "0 8px",
									overflow: "hidden"
								},
								children: labels.commit
							})
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					"data-git-graph-body": "",
					onScroll,
					style: {
						flex: "1 1 0%",
						minHeight: 0,
						overflow: "auto",
						overscrollBehavior: "contain",
						width: "100%",
						scrollbarGutter: "stable"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: shellStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								position: "relative",
								height: layout.height + layout.rowHeight,
								borderRight: "1px solid var(--dsw-alias-border-l2)"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
								width: graphWidth,
								height: layout.height + layout.rowHeight,
								viewBox: `0 0 ${graphWidth} ${layout.height + layout.rowHeight}`,
								role: "img",
								"aria-label": labels.graph,
								style: {
									position: "absolute",
									inset: 0,
									overflow: "visible"
								},
								children: [layout.paths.map((path) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									d: path.path,
									fill: "none",
									stroke: laneColor(path.laneIndex),
									strokeWidth: 2,
									opacity: hovered && !isRelated(path, hovered) ? .25 : isRelated(path, hovered) ? 1 : .55
								}, path.id)), layout.rows.map((row) => {
									const selected = row.commit.hash === selectedCommitHash;
									const color = laneColor(row.laneIndex);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx: row.x,
										cy: row.y,
										r: NODE_RADIUS,
										fill: color,
										stroke: "var(--dsw-specific-menu)",
										strokeWidth: 2,
										opacity: hovered && hovered !== row.commit.hash && !selected ? .7 : 1
									}), selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx: row.x,
										cy: row.y,
										r: SELECTED_RING,
										fill: "none",
										stroke: color,
										strokeWidth: 1,
										opacity: .9
									}) : null] }, row.commit.hash);
								})]
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: { minWidth: 0 },
							children: [layout.rows.map((row) => {
								const selected = row.commit.hash === selectedCommitHash;
								const isHovered = hovered === row.commit.hash;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"data-workspace-git-graph-row": row.commit.hash,
									"data-git-graph-cols": "",
									onClick: () => {
										onSelectCommit(row.commit.hash);
									},
									onMouseEnter: () => {
										setHovered(row.commit.hash);
									},
									onMouseLeave: () => {
										setHovered(null);
									},
									style: {
										...colsStyle,
										width: "100%",
										height: layout.rowHeight,
										alignItems: "center",
										border: "none",
										borderBottom: "1px solid var(--dsw-alias-border-l1)",
										background: selected ? "var(--dsw-alias-interactive-bg-active)" : isHovered ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
										cursor: "pointer",
										textAlign: "left",
										font: "var(--dsw-font-xxs-12, 12px/16px sans-serif)",
										color: "var(--dsw-alias-label-primary)",
										padding: 0
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												display: "flex",
												alignItems: "center",
												gap: "6px",
												minWidth: 0,
												padding: "0 8px",
												overflow: "hidden"
											},
											children: [
												row.commit.refs.slice(0, 3).map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: {
														flex: "none",
														maxWidth: "96px",
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
														fontSize: "11px",
														lineHeight: "18px",
														padding: "0 6px",
														borderRadius: "4px",
														border: "1px solid var(--dsw-alias-border-l2)",
														color: "var(--dsw-alias-label-secondary)",
														background: ref.kind === "head" ? "var(--dsw-alias-interactive-bg-hover)" : "transparent"
													},
													children: ref.name
												}, `${row.commit.hash}:${ref.name}`)),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: {
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
														minWidth: 0
													},
													children: row.commit.subject || shortHash(row.commit.hash)
												}),
												row.commit.parents.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: {
														flex: "none",
														color: "var(--dsw-alias-label-tertiary)",
														fontSize: "11px"
													},
													children: "merge"
												}) : null
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"data-git-graph-meta": "",
											style: {
												padding: "0 8px",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												color: "var(--dsw-alias-label-tertiary)"
											},
											children: formatTime(row.commit.authoredAtMs)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"data-git-graph-meta": "",
											style: {
												padding: "0 8px",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												color: "var(--dsw-alias-label-tertiary)"
											},
											children: row.commit.authorName ?? "—"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												padding: "0 8px",
												fontFamily: "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)",
												color: "var(--dsw-alias-label-tertiary)"
											},
											children: shortHash(row.commit.hash)
										})
									]
								}, row.commit.hash);
							}), hasMore && onLoadMore ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: loadingMore,
								onClick: onLoadMore,
								style: {
									width: "100%",
									height: "30px",
									border: "none",
									borderBottom: "1px solid var(--dsw-alias-border-l1)",
									background: "var(--dsw-alias-bg-layer-1)",
									color: "var(--dsw-alias-label-secondary)",
									cursor: loadingMore ? "default" : "pointer",
									font: "var(--dsw-font-xxs-12, 12px/16px sans-serif)"
								},
								children: loadingMore ? labels.loadingMore : labels.loadMore
							}) : null]
						})]
					})
				})]
			});
		}
		//#endregion
		//#region src/client/git-graph/GitGraphSplit.tsx
		/**
		* Details-rail width, copied from ui-trajectory's `.details` rule:
		* `width: clamp(320px, 38%, 440px)` with `max-width: calc(100% - 280px)` so the
		* list always keeps a usable minimum even in a narrow modal.
		*/
		const DETAILS_WIDTH = "clamp(320px, 38%, 440px)";
		const DETAILS_MAX_WIDTH = "calc(100% - 280px)";
		/** Fallback under the list's usable minimum (narrow modal / phone-width view). */
		const DETAILS_NARROW_WIDTH = "min(320px, 42%)";
		/**
		* Split layout used by both the session view and the modal dialog.
		*/
		function GitGraphSplit({ cwd, commits, hasMore, loadingMore, selectedCommitHash, onSelectCommit, onLoadMore, t }) {
			const detailOpen = selectedCommitHash !== null && selectedCommitHash !== "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-workspace-git-graph-split": "",
				"data-detail-open": detailOpen ? "true" : "false",
				style: {
					display: "flex",
					flexDirection: "row",
					alignItems: "stretch",
					flex: "1 1 0%",
					minHeight: 0,
					minWidth: 0,
					width: "100%",
					height: "100%",
					overflow: "hidden",
					containerType: "inline-size",
					"--dsh-scrollbar-thumb": "var(--dsw-alias-scrollbar-bg-l2)",
					"--dsh-scrollbar-thumb-hover": "var(--dsw-alias-scrollbar-hover-l2)"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					"data-workspace-git-graph-list": "",
					style: {
						flex: "1 1 0%",
						minWidth: 0,
						minHeight: 0,
						overflow: "hidden",
						display: "flex",
						flexDirection: "column"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitGraphPane, {
						commits,
						hasMore,
						loadingMore,
						selectedCommitHash,
						onSelectCommit,
						onLoadMore,
						labels: {
							empty: t("gitGraphEmpty", "No commits yet"),
							loadMore: t("gitGraphLoadMore", "Load more"),
							loadingMore: t("loading", "Loading…"),
							graph: t("gitGraphColumnGraph", "Graph"),
							description: t("gitGraphColumnDescription", "Description"),
							date: t("gitGraphColumnDate", "Date"),
							author: t("gitGraphColumnAuthor", "Author"),
							commit: t("gitGraphColumnCommit", "Commit")
						}
					})
				}), detailOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitGraphDetailPanel, {
					cwd,
					hash: selectedCommitHash,
					onClose: () => {
						onSelectCommit(null);
					},
					width: DETAILS_WIDTH,
					maxWidth: DETAILS_MAX_WIDTH,
					narrowWidth: DETAILS_NARROW_WIDTH,
					labels: {
						loading: t("loading", "Loading…"),
						error: t("gitGraphCommitError", "Failed to load commit"),
						close: t("close", "Close"),
						commitInfo: t("gitGraphCommitInfo", "Commit"),
						author: t("gitGraphColumnAuthor", "Author"),
						time: t("gitGraphColumnDate", "Date"),
						branches: t("gitGraphBranchInfo", "Branches"),
						files: t("gitGraphChangedFiles", "Changed files"),
						filesCount: (n) => t("gitGraphFilesCount", "{n} files").replace("{n}", String(n)),
						inBranches: (n) => t("gitGraphInBranches", "In {n} refs:").replace("{n}", String(n))
					}
				}) : null]
			});
		}
		//#endregion
		//#region src/client/git-graph/useCommitGraph.ts
		/**
		* Shared commit-graph load state for the modal dialog and session view.
		*/
		const PAGE_SIZE = 50;
		/**
		* Load and paginate the commit graph for one workspace path.
		* @param cwd - absolute workspace path.
		* @param enabled - when false, skip fetch and ignore in-flight results.
		* @returns graph load state and actions.
		*/
		function useCommitGraph(cwd, enabled) {
			const [loading, setLoading] = (0, react.useState)(enabled);
			const [loadingMore, setLoadingMore] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [commits, setCommits] = (0, react.useState)([]);
			const [hasMore, setHasMore] = (0, react.useState)(false);
			const [selected, setSelected] = (0, react.useState)(null);
			const loadingMoreRef = (0, react.useRef)(false);
			const generationRef = (0, react.useRef)(0);
			const prevInputRef = (0, react.useRef)({
				cwd,
				enabled
			});
			const prev = prevInputRef.current;
			if (prev.cwd !== cwd || prev.enabled !== enabled) {
				const cwdChanged = prev.cwd !== cwd;
				const enabledChanged = prev.enabled !== enabled;
				prevInputRef.current = {
					cwd,
					enabled
				};
				if (!enabled) {
					generationRef.current += 1;
					setLoading(false);
					setLoadingMore(false);
					loadingMoreRef.current = false;
				} else if (enabledChanged || cwdChanged) {
					generationRef.current += 1;
					setLoading(true);
					setLoadingMore(false);
					loadingMoreRef.current = false;
					setError(null);
					setCommits([]);
					setHasMore(false);
					setSelected(null);
				}
			}
			const loadInitial = (0, react.useCallback)(async () => {
				const generation = ++generationRef.current;
				setLoading(true);
				setLoadingMore(false);
				loadingMoreRef.current = false;
				setError(null);
				setCommits([]);
				setHasMore(false);
				setSelected(null);
				try {
					const result = await fetchCommitGraph(cwd, PAGE_SIZE, 0);
					if (generation !== generationRef.current) return;
					setCommits(result.commits);
					setHasMore(result.hasMore);
					setSelected(null);
				} catch (err) {
					if (generation !== generationRef.current) return;
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					if (generation === generationRef.current) setLoading(false);
				}
			}, [cwd]);
			(0, react.useEffect)(() => {
				if (!enabled) {
					generationRef.current += 1;
					setLoading(false);
					setLoadingMore(false);
					loadingMoreRef.current = false;
					return;
				}
				loadInitial();
			}, [enabled, loadInitial]);
			const loadMore = (0, react.useCallback)(async () => {
				if (!enabled || loading || loadingMore || loadingMoreRef.current || !hasMore) return;
				const generation = generationRef.current;
				loadingMoreRef.current = true;
				setLoadingMore(true);
				try {
					const result = await fetchCommitGraph(cwd, PAGE_SIZE, commits.length);
					if (generation !== generationRef.current) return;
					setCommits((prev) => [...prev, ...result.commits]);
					setHasMore(result.hasMore);
				} catch {} finally {
					if (generation === generationRef.current) {
						loadingMoreRef.current = false;
						setLoadingMore(false);
					}
				}
			}, [
				cwd,
				commits.length,
				enabled,
				hasMore,
				loading,
				loadingMore
			]);
			return {
				loading,
				loadingMore,
				error,
				commits,
				hasMore,
				selected,
				setSelected,
				loadMore: () => {
					loadMore();
				},
				reload: () => {
					loadInitial();
				}
			};
		}
		//#endregion
		//#region src/client/git-graph/GitGraphDialog.tsx
		/**
		* Modal wrapper that loads the commit graph for a workspace path.
		* Opened from the branch menu's "Git Graph" footer.
		*/
		/**
		* Commit-graph dialog.
		*/
		function GitGraphDialog({ open, cwd, onClose, t }) {
			const label = (key, fallback) => t?.(key) ?? fallback;
			const graph = useCommitGraph(cwd, open);
			(0, react.useEffect)(() => {
				if (!open) return;
				ensureGitGraphDialogStyles();
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose,
				title: label("gitGraph", "Git Graph"),
				closeLabel: label("close", "Close"),
				className: "workspace-git-graph-dialog",
				contentClassName: "workspace-git-graph-modal",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					"data-workspace-git-graph-root": "",
					style: {
						display: "flex",
						flexDirection: "column",
						flex: 1,
						minHeight: 0,
						minWidth: 0,
						width: "100%",
						height: "100%"
					},
					children: graph.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							minHeight: "240px",
							color: "var(--dsw-alias-label-tertiary)",
							fontSize: "14px"
						},
						children: label("loading", "Loading…")
					}) : graph.error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							minHeight: "240px",
							color: "var(--dsw-alias-state-error-primary)",
							fontSize: "14px",
							padding: "16px",
							textAlign: "center"
						},
						children: [
							label("gitGraphError", "Failed to load Git Graph"),
							": ",
							graph.error
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitGraphSplit, {
						cwd,
						commits: graph.commits,
						hasMore: graph.hasMore,
						loadingMore: graph.loadingMore,
						selectedCommitHash: graph.selected,
						onSelectCommit: graph.setSelected,
						onLoadMore: graph.loadMore,
						t: label
					})
				})
			});
		}
		//#endregion
		//#region src/client/BranchSelect.tsx
		/**
		* The composer's branch selector: a pill at the right of the chat input row
		* showing the workspace's current branch, opening a searchable list of the
		* repository's local branches plus a "Git Graph" footer action.
		*
		* Layout mirrors the shell's branch picker card:
		*   1. search field at the top ("搜索分支")
		*   2. "分支" heading + filtered local refs
		*   3. "Git 图谱" footer (no create-branch row)
		*
		* Both the pill and every row of its list lead with the branch glyph
		* ({@link BranchIcon}), so a branch is recognizable as one before its name is
		* read.
		*
		* Picking a branch runs `git switch` via the host checkout route and updates
		* the displayed HEAD. Clicking the already-current branch only closes the menu.
		* "Git Graph" opens the in-plugin commit-graph dialog.
		*
		* The trigger renders NOTHING when there is no branch to show (no session cwd,
		* a directory that is not a repository, a host route that failed). The input
		* bar's trailing cluster must not gain a control for a non-repository project.
		*
		* The list itself is fetched lazily on first open: the closed trigger only needs
		* the current branch, and a repository can hold hundreds of refs.
		*/
		/** How long a switch-failure toast stays on the trigger, in milliseconds. */
		const ERROR_FEEDBACK_MS = 2400;
		/** Bound on the branch list the menu renders, so a huge repo cannot flood the DOM. */
		const MAX_VISIBLE_REFS = 200;
		/** Stable id for the footer "Git Graph" row (never collides with a ref name). */
		const GIT_GRAPH_ID = "__git-graph__";
		/**
		* The selector. Renders null when the workspace has no branch.
		* @param props - the composed slot props.
		* @returns the trigger and its menu, or null.
		*/
		function BranchSelect({ sessionId, useSessions, t, store }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [opening, setOpening] = (0, react.useState)(false);
			const [switching, setSwitching] = (0, react.useState)(false);
			const [switchError, setSwitchError] = (0, react.useState)(null);
			const [refs, setRefs] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const [graphOpen, setGraphOpen] = (0, react.useState)(false);
			const [fixedPos, setFixedPos] = (0, react.useState)(null);
			const timer = (0, react.useRef)(void 0);
			const rootRef = (0, react.useRef)(null);
			const listRef = (0, react.useRef)(null);
			const cwd = useSessions?.((state) => sessionId === void 0 ? void 0 : state.byId[sessionId]?.cwd);
			const [, setRevision] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				if (store === void 0) return;
				return store.subscribe(() => {
					setRevision((value) => value + 1);
				});
			}, [store]);
			(0, react.useEffect)(() => {
				if (store === void 0 || cwd === void 0 || cwd === "") return;
				store.request([cwd]);
			}, [store, cwd]);
			(0, react.useEffect)(() => {
				if (!opening || cwd === void 0 || cwd === "") return;
				let cancelled = false;
				setLoading(true);
				fetchRefs(cwd).then((result) => {
					if (!cancelled) setRefs(result.refs);
				}).catch(() => {
					if (!cancelled) setRefs([]);
				}).finally(() => {
					if (!cancelled) setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [opening, cwd]);
			(0, react.useEffect)(() => {
				if (!opening || refs === null || loading) return;
				setOpen(true);
			}, [
				opening,
				refs,
				loading
			]);
			(0, react.useEffect)(() => () => {
				if (timer.current !== void 0) clearTimeout(timer.current);
			}, []);
			(0, react.useEffect)(() => {
				if (!open) setQuery("");
			}, [open]);
			const close = () => {
				setOpen(false);
				setOpening(false);
			};
			(0, react.useLayoutEffect)(() => {
				if (!open) {
					setFixedPos(null);
					return;
				}
				const place = () => {
					const r = rootRef.current?.getBoundingClientRect();
					const listEl = listRef.current;
					if (r === void 0 || listEl === null) return;
					const lw = listEl.offsetWidth;
					const lh = listEl.offsetHeight;
					if (lw <= 0 || lh <= 0) return;
					const MARGIN = 12;
					let x = r.left + (r.width - lw) / 2;
					let y = r.top - lh - 4;
					x = Math.min(Math.max(x, MARGIN), window.innerWidth - lw - MARGIN);
					y = Math.min(Math.max(y, MARGIN), window.innerHeight - lh - MARGIN);
					setFixedPos({
						left: x,
						top: y,
						position: "fixed"
					});
				};
				place();
				const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(place) : void 0;
				window.addEventListener("scroll", place, true);
				window.addEventListener("resize", place);
				let observer;
				if (typeof ResizeObserver !== "undefined" && listRef.current !== null) {
					observer = new ResizeObserver(place);
					observer.observe(listRef.current);
				}
				return () => {
					if (raf !== void 0) cancelAnimationFrame(raf);
					observer?.disconnect();
					window.removeEventListener("scroll", place, true);
					window.removeEventListener("resize", place);
				};
			}, [
				open,
				query,
				refs
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (e) => {
					if (!(e.target instanceof Node)) return;
					if (rootRef.current?.contains(e.target) === true) return;
					if (listRef.current?.contains(e.target) === true) return;
					close();
				};
				const onKeyDown = (e) => {
					if (e.key === "Escape") close();
				};
				document.addEventListener("pointerdown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);
			const answer = cwd === void 0 || cwd === "" ? void 0 : store?.branchOf(cwd);
			const label = (key, fallback) => t?.(key) ?? fallback;
			const filtered = (0, react.useMemo)(() => {
				const list = refs ?? [];
				const needle = query.trim().toLowerCase();
				return (needle === "" ? list : list.filter((entry) => entry.name.toLowerCase().includes(needle))).slice(0, MAX_VISIBLE_REFS);
			}, [refs, query]);
			const menuReady = refs !== null && !loading;
			if (answer === void 0 || answer.branch === null) return null;
			const branch = answer.branch;
			const selectedName = refs?.find((entry) => entry.current)?.name;
			const switchTo = (name) => {
				if (cwd === void 0 || cwd === "" || switching) return;
				if (name === selectedName || name === branch) {
					close();
					return;
				}
				close();
				setSwitching(true);
				setSwitchError(null);
				checkoutBranch(cwd, name).then((result) => {
					store?.publish(cwd, {
						branch: result.branch,
						detached: false
					});
					setRefs((prev) => prev?.map((entry) => ({
						...entry,
						current: entry.name === result.branch
					})) ?? null);
				}).catch((err) => {
					const message = err instanceof WorkspaceGitApiError ? err.message : err instanceof Error ? err.message : String(err);
					setSwitchError(message);
					if (timer.current !== void 0) clearTimeout(timer.current);
					timer.current = setTimeout(() => {
						setSwitchError(null);
					}, ERROR_FEEDBACK_MS);
				}).finally(() => {
					setSwitching(false);
				});
			};
			const openGraph = () => {
				setGraphOpen(true);
				close();
			};
			const title = switchError !== null ? `${label("switchFailed", "Switch failed")}: ${switchError}` : switching ? label("switching", "Switching…") : answer.detached ? `${label("detached", "Detached HEAD")} · ${label("openMenu", "Show branches")}` : label("openMenu", "Show branches");
			const trigger = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				"data-workspace-git-select": "",
				"aria-haspopup": "menu",
				"aria-expanded": open || opening,
				title,
				"aria-label": `${label("branch", "Branch")}: ${branch}`,
				disabled: switching,
				onClick: () => {
					if (opening) {
						close();
						return;
					}
					setOpening(true);
					if (refs !== null) setOpen(true);
				},
				onMouseEnter: (e) => {
					e.currentTarget.style.background = "#f1f1f1";
				},
				onMouseLeave: (e) => {
					e.currentTarget.style.background = "transparent";
				},
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: "4px",
					maxWidth: "170px",
					height: "25px",
					padding: "0 8px",
					border: "0px",
					borderRadius: "999px",
					background: "transparent",
					color: "var(--dsw-alias-label-secondary)",
					font: "inherit",
					fontSize: "12px",
					cursor: switching ? "wait" : "pointer",
					opacity: switching ? .7 : 1
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					style: {
						display: "inline-flex",
						alignItems: "center",
						color: "inherit",
						flex: "none"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BranchIcon, { size: 14 })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: switching ? label("switching", "Switching…") : branch
				})]
			});
			const rowStyle = {
				display: "flex",
				alignItems: "center",
				gap: "8px",
				width: "100%",
				minHeight: "34px",
				padding: "5px 10px",
				border: "none",
				borderRadius: "10px",
				background: "transparent",
				cursor: "pointer",
				font: "inherit",
				fontSize: "14px",
				lineHeight: "22px",
				color: "var(--dsw-alias-label-primary)",
				textAlign: "left"
			};
			const emptyText = (refs ?? []).length === 0 ? label("noBranches", "No local branches") : label("noMatches", "No matching branches");
			const itemCount = filtered.length === 0 ? 1 : 1 + filtered.length;
			const menu = open && menuReady && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: listRef,
				role: "menu",
				"data-workspace-git-menu": "portal",
				"data-side": "top",
				"data-align": "center",
				"data-item-count": String(itemCount),
				style: {
					...fixedPos,
					visibility: fixedPos === null ? "hidden" : "visible",
					zIndex: 1100,
					boxSizing: "border-box",
					minWidth: "240px",
					maxWidth: "360px",
					maxHeight: "calc(100vh - 24px)",
					padding: "4px",
					display: "flex",
					flexDirection: "column",
					borderRadius: "20px",
					background: "var(--dsw-specific-menu)",
					boxShadow: "var(--dsw-elevation-prominent)"
				},
				onClick: (e) => {
					e.stopPropagation();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "8px",
							padding: "6px 10px"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							style: {
								display: "inline-flex",
								flex: "none",
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchIcon, { size: 16 })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							autoFocus: true,
							value: query,
							placeholder: label("searchBranches", "Search branches"),
							"aria-label": label("searchBranches", "Search branches"),
							"data-workspace-git-search": "",
							onChange: (e) => {
								setQuery(e.target.value);
							},
							onKeyDown: (e) => {
								e.stopPropagation();
								if (e.key === "Escape") {
									e.preventDefault();
									close();
								}
							},
							style: {
								flex: 1,
								minWidth: 0,
								border: "none",
								outline: "none",
								background: "transparent",
								font: "inherit",
								fontSize: "14px",
								lineHeight: "22px",
								color: "var(--dsw-alias-label-primary)"
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "presentation",
						style: {
							height: "0.5px",
							margin: "0 2px 4px",
							background: "var(--dsw-alias-border-l1)"
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "presentation",
						style: {
							display: "flex",
							flexDirection: "column",
							minHeight: 0,
							overflowY: "auto"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "presentation",
							style: {
								padding: "4px 10px",
								fontSize: "12px",
								lineHeight: "16px",
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: label("branch", "Branch")
						}), filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "presentation",
							style: {
								padding: "8px 10px",
								fontSize: "13px",
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: emptyText
						}) : filtered.map((entry) => {
							const selected = entry.name === selectedName;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitem",
								"data-workspace-git-branch": entry.name,
								"aria-current": selected ? "true" : void 0,
								style: {
									...rowStyle,
									background: selected ? "var(--dsw-alias-interactive-bg-hover)" : "transparent"
								},
								onMouseEnter: (e) => {
									e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
								},
								onMouseLeave: (e) => {
									e.currentTarget.style.background = selected ? "var(--dsw-alias-interactive-bg-hover)" : "transparent";
								},
								onClick: () => {
									switchTo(entry.name);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										style: {
											display: "inline-flex",
											flex: "none",
											width: "16px",
											height: "16px",
											alignItems: "center",
											justifyContent: "center",
											color: "var(--dsw-alias-label-tertiary)"
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BranchIcon, { size: 16 })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											flex: 1,
											minWidth: 0,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										},
										children: entry.name
									}),
									selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										style: {
											flex: "none",
											color: "var(--dsw-alias-label-primary)"
										},
										children: "✓"
									}) : null
								]
							}, entry.name);
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "presentation",
						style: {
							flex: "none",
							display: "flex",
							flexDirection: "column",
							marginTop: "4px",
							paddingTop: "4px",
							borderTop: "0.5px solid var(--dsw-alias-border-l2)"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "menuitem",
							"data-workspace-git-graph": "",
							id: GIT_GRAPH_ID,
							style: rowStyle,
							onMouseEnter: (e) => {
								e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
							},
							onMouseLeave: (e) => {
								e.currentTarget.style.background = "transparent";
							},
							onClick: openGraph,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									display: "inline-flex",
									flex: "none",
									width: "16px",
									height: "16px",
									alignItems: "center",
									justifyContent: "center",
									color: "var(--dsw-alias-label-tertiary)"
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GraphIcon, { size: 16 })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: label("gitGraph", "Git Graph")
							})]
						})
					})
				]
			}), document.body);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				ref: rootRef,
				style: {
					display: "inline-flex",
					position: "relative"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: title,
						side: "top",
						children: trigger
					}),
					menu,
					cwd !== void 0 && cwd !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitGraphDialog, {
						open: graphOpen,
						cwd,
						onClose: () => {
							setGraphOpen(false);
						},
						t
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/git-graph/viewStyles.ts
		const STYLE_ID = "workspace-git-graph-view-css";
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
`;
		function ensureGitGraphViewStyles() {
			if (typeof document === "undefined") return;
			const existing = document.getElementById(STYLE_ID);
			if (existing !== null) {
				existing.textContent = CSS;
				return;
			}
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/git-graph/GitGraphView.tsx
		/**
		* Session conversation view: commit graph gated on a known HEAD for the workspace.
		*/
		/**
		* Git graph session view. Renders nothing until the branch store knows HEAD.
		*/
		function GitGraphView({ sessionId, useSessions, t, store }) {
			const cwd = useSessions?.((state) => sessionId === void 0 ? void 0 : state.byId[sessionId]?.cwd);
			const [, setRevision] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				if (store === void 0) return;
				return store.subscribe(() => {
					setRevision((value) => value + 1);
				});
			}, [store]);
			(0, react.useEffect)(() => {
				if (store === void 0 || cwd === void 0 || cwd === "") return;
				store.request([cwd]);
			}, [store, cwd]);
			const answer = cwd === void 0 || cwd === "" ? void 0 : store?.branchOf(cwd);
			const hasHead = answer !== void 0 && answer.branch !== null;
			const graphEnabled = hasHead && cwd !== void 0 && cwd !== "";
			const graph = useCommitGraph(cwd ?? "", graphEnabled);
			const label = (key, fallback) => t?.(key) ?? fallback;
			(0, react.useEffect)(() => {
				if (!graphEnabled) return;
				ensureGitGraphViewStyles();
			}, [graphEnabled]);
			if (cwd === void 0 || cwd === "") return null;
			const emptyState = (title, hint, tone) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "6px",
					flex: "1 1 0%",
					minHeight: 0,
					padding: "16px",
					textAlign: "center"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: "14px",
						color: tone === "error" ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-label-secondary)"
					},
					children: title
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: "12px",
						color: "var(--dsw-alias-label-tertiary)"
					},
					children: hint
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-workspace-git-graph-view": "",
				"data-conversation-composer-overlay": "",
				style: {
					display: "flex",
					flexDirection: "column",
					flex: "1 1 0%",
					minHeight: 0,
					minWidth: 0,
					width: "100%",
					height: "100%",
					maxHeight: "100%",
					overflow: "hidden"
				},
				children: !hasHead ? emptyState(label("gitGraphNoRepo", "This directory is not a Git repository"), label("gitGraphNoRepoHint", "Initialize a repository here to see its commit graph."), "plain") : graph.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						minHeight: "240px",
						color: "var(--dsw-alias-label-tertiary)",
						fontSize: "14px"
					},
					children: label("loading", "Loading…")
				}) : graph.error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						minHeight: "240px",
						color: "var(--dsw-alias-state-error-primary)",
						fontSize: "14px",
						padding: "16px",
						textAlign: "center"
					},
					children: [
						label("gitGraphError", "Failed to load Git Graph"),
						": ",
						graph.error
					]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitGraphSplit, {
					cwd,
					commits: graph.commits,
					hasMore: graph.hasMore,
					loadingMore: graph.loadingMore,
					selectedCommitHash: graph.selected,
					onSelectCommit: graph.setSelected,
					onLoadMore: graph.loadMore,
					t: label
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Minimal zh/en copy for the plugin. The client `apply` attaches the locale
		* service (`ctx.locale`, provided by `@deepseek-ai/dsh-client-locale`) and
		* registers these dictionaries under {@link LOCALE_NS}, so the copy follows
		* the Host-backed language preference and switches live. Without an attached
		* service (standalone/test compositions) the browser language decides.
		*/
		/** The locale namespace this plugin owns. */
		const LOCALE_NS = "workspaceGit";
		/** The zh dictionary. */
		const zh = {
			branch: "分支",
			openMenu: "查看分支列表",
			switchBranch: "切换分支",
			switching: "切换中…",
			switchFailed: "切换失败",
			detached: "游离 HEAD",
			loading: "加载中…",
			noBranches: "没有本地分支",
			noMatches: "没有匹配的分支",
			searchBranches: "搜索分支",
			gitGraph: "Git 图谱",
			gitGraphDescription: "本地分支的提交历史",
			gitGraphEmpty: "暂无提交",
			gitGraphError: "加载 Git 图谱失败",
			gitGraphNoRepo: "当前目录不是 Git 仓库",
			gitGraphNoRepoHint: "在此目录初始化仓库后即可查看提交图谱。",
			gitGraphLoadMore: "加载更多",
			gitGraphColumnGraph: "图谱",
			gitGraphColumnDescription: "说明",
			gitGraphColumnDate: "日期",
			gitGraphColumnAuthor: "作者",
			gitGraphColumnCommit: "提交",
			gitGraphSelectCommit: "选择一条提交查看详情",
			gitGraphCommitInfo: "提交信息",
			gitGraphCommitError: "加载提交失败",
			gitGraphBranchInfo: "分支信息",
			gitGraphChangedFiles: "变更文件",
			gitGraphFilesCount: "{n} 个文件",
			gitGraphInBranches: "在 {n} 个引用中:",
			close: "关闭"
		};
		/** The en dictionary. */
		const en = {
			branch: "Branch",
			openMenu: "Show branches",
			switchBranch: "Switch branch",
			switching: "Switching…",
			switchFailed: "Switch failed",
			detached: "Detached HEAD",
			loading: "Loading…",
			noBranches: "No local branches",
			noMatches: "No matching branches",
			searchBranches: "Search branches",
			gitGraph: "Git Graph",
			gitGraphDescription: "Commit history across local branches",
			gitGraphEmpty: "No commits yet",
			gitGraphError: "Failed to load Git Graph",
			gitGraphNoRepo: "This directory is not a Git repository",
			gitGraphNoRepoHint: "Initialize a repository here to see its commit graph.",
			gitGraphLoadMore: "Load more",
			gitGraphColumnGraph: "Graph",
			gitGraphColumnDescription: "Description",
			gitGraphColumnDate: "Date",
			gitGraphColumnAuthor: "Author",
			gitGraphColumnCommit: "Commit",
			gitGraphSelectCommit: "Select a commit to inspect",
			gitGraphCommitInfo: "Commit",
			gitGraphCommitError: "Failed to load commit",
			gitGraphBranchInfo: "Branches",
			gitGraphChangedFiles: "Changed files",
			gitGraphFilesCount: "{n} files",
			gitGraphInBranches: "In {n} refs:",
			close: "Close"
		};
		//#endregion
		//#region src/client/index.tsx
		/** Services required before mounting (all provided by the client runtime). */
		const inject = [
			"slots",
			"sessions",
			"locale"
		];
		/** The slot this plugin occupies: the composer's left tool cluster, right after the mode selector. */
		const INPUT_SLOT = "conversation.input.left";
		const VIEW_SLOT = "conversation.view";
		/**
		* Client plugin body.
		* @param ctx - the client cordis context (slots, sessions, locale).
		*/
		function apply(ctx) {
			ctx.locale;
			ctx.effect(() => {
				const offZh = ctx.locale.register(LOCALE_NS, "zh", zh);
				const offEn = ctx.locale.register(LOCALE_NS, "en", en);
				return () => {
					offZh();
					offEn();
				};
			}, "dsh-workspace-git: dictionaries");
			const store = new BranchStore();
			ctx.effect(() => () => store.dispose(), "dsh-workspace-git: branch store");
			ctx.effect(() => ctx.slots.inject(INPUT_SLOT, () => ctx.slots.register({
				name: INPUT_SLOT,
				id: "workspace-git",
				order: 20,
				locale: LOCALE_NS,
				registrant: "dsh-workspace-git",
				inject: () => ({ store })
			}, BranchSelect)), "dsh-workspace-git: composer branch selector");
			ctx.effect(() => ctx.slots.inject(VIEW_SLOT, () => ctx.slots.register({
				name: VIEW_SLOT,
				id: "workspace-git-graph",
				order: 20,
				locale: LOCALE_NS,
				registrant: "dsh-workspace-git",
				label: () => {
					return ctx.locale.getSnapshot().active.startsWith("zh") ? "Git 图谱" : "Git Graph";
				},
				inject: () => ({ store })
			}, GitGraphView)), "dsh-workspace-git: git graph conversation view");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map