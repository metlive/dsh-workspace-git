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
		* Resolve the local + remote branch list of one repository.
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
		* Read the work tree's uncommitted state, BEFORE attempting a switch.
		*
		* Deliberately a separate call from {@link checkoutBranch}: the guard has to
		* show the user what is dirty and wait for a decision, so the check cannot be
		* folded into the write.
		* @param path - the absolute workspace directory.
		* @param signal - abort signal.
		* @returns the status (empty `changes` when the tree is clean).
		*/
		async function fetchWorkTreeStatus(path, signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/status", {
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
		* Switch the work tree at `path` to the given branch.
		*
		* When `kind` is `remote`, the host creates or reuses a local tracking branch
		* (`git switch --track`). Otherwise it runs a plain `git switch`.
		* @param path - the absolute workspace directory.
		* @param branch - short local name, or `remote/branch` for tracking refs.
		* @param kind - local vs remote-tracking (defaults to local).
		* @param signal - abort signal.
		* @returns the local branch now checked out.
		*/
		async function checkoutBranch(path, branch, kind = "local", signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/checkout", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						path,
						branch,
						kind
					}),
					signal
				});
			} catch (error) {
				throw new WorkspaceGitApiError("network", error instanceof Error ? error.message : String(error));
			}
			return readEnvelope(response);
		}
		/**
		* Create `branch` at HEAD and check it out in the work tree at `path`.
		* @param path - the absolute workspace directory.
		* @param branch - short local branch name for the new branch.
		* @param signal - abort signal.
		* @returns the branch now checked out.
		*/
		async function createBranch(path, branch, signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/create-branch", {
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
		/**
		* Rewrite one composer draft through the session's own model.
		*
		* Unlike the git lookups, a failure here is NOT silent: the caller shows the
		* reason, because the user explicitly asked for this and needs to know why
		* nothing happened.
		* @param sessionId - the session whose model performs the rewrite.
		* @param draft - the current composer text.
		* @param signal - abort signal; an in-flight enhancement is cancelled with it.
		* @returns the rewrite.
		* @throws WorkspaceGitApiError carrying a machine code the caller can explain.
		*/
		async function enhancePrompt(sessionId, draft, signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/enhance-prompt", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						sessionId,
						draft
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
		//#region src/client/NewBranchIcon.tsx
		/**
		* The new-branch glyph.
		* @param props - the drawn size.
		* @returns the icon element.
		*/
		function NewBranchIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				"data-workspace-git-new-branch-icon": "",
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
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 3.5v9M3.5 8h9",
					stroke: "currentColor",
					strokeWidth: "1.6",
					strokeLinecap: "round"
				})
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
		const STYLE_ID$4 = "workspace-git-graph-dialog-css";
		const CSS$4 = `
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
.workspace-git-graph-dialog [data-git-graph-toolbar] {
  flex: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
  overflow: visible !important;
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
			const existing = document.getElementById(STYLE_ID$4);
			if (existing !== null) {
				existing.textContent = CSS$4;
				return;
			}
			const style = document.createElement("style");
			style.id = STYLE_ID$4;
			style.textContent = CSS$4;
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
		async function fetchRefTips(path, signal) {
			let response;
			try {
				response = await fetch("/workspace-git/api/tips", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ path }),
					signal
				});
			} catch (error) {
				throw new WorkspaceGitApiError("network", error instanceof Error ? error.message : String(error));
			}
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) throw new WorkspaceGitApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? `HTTP ${response.status}`);
			return {
				tips: parsed.value.tips ?? {},
				branches: parsed.value.branches ?? {}
			};
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
		//#region src/client/git-graph/commitBodyStyles.ts
		/**
		* Font-size pin for the commit MESSAGE block in the detail rail.
		*
		* ## Why this needs CSS at all
		*
		* The message block is the one part of the detail rail that renders through
		* `MarkdownText`, and the Markdown baseline does NOT inherit a single root
		* size the way a plain container does. In the host's own token sheet
		* (`@deepseek-ai/dsh-client-ui-theme`) the sizes are:
		*
		*   --dsw-font-markdown-base       → var(--dsh-content-font-size, 14px)
		*   --dsw-font-markdown-h1         → 21px + delta
		*   --dsw-font-markdown-h2         → 19px + delta
		*   --dsw-font-markdown-h3         → 18px + delta
		*   --dsw-font-markdown-h4         → var(--dsh-content-font-size, 14px)
		*   --dsw-font-markdown-code-block → 11px
		*
		* The `body` variant applies those as a `font:` SHORTHAND, which resets
		* font-size — so a `font-size` on our wrapper does not reach a heading — and
		* the deepsuite sheet further pins inline code with
		* `font-size: 0.875em !important`. An ancestor `font-size` therefore cannot win
		* on inheritance alone: every element has to be addressed explicitly.
		*
		* The rail is a compact 12px surface — header, metadata rows, and file tree are
		* all 12px — so the message renders at 12px too. Line height is pinned in
		* absolute px rather than left to the token's `calc(24px + delta)`, because
		* 24px leading on 12px text reads as double-spaced in a 320-440px rail.
		*
		* ## Why the scope is an attribute, and NOT `.markdown`
		*
		* `MarkdownText`'s root is `clsx(markdownCss.markdown, …)` — a CSS-MODULE class
		* that the shell's bundler HASHES (the raw stylesheet maps `markdown` to a name
		* like `NkM3Kq_markdown`). A hardcoded `.markdown` selector therefore may never
		* match, and the package exposes no `className` prop to tag the root from here.
		* The root's other hook, `data-markdown-variant`, is emitted ONLY for the
		* `compact` variant (`variant === 'compact' ? variant : void 0`), so it is
		* absent for the default `body` variant this panel uses.
		*
		* The only stable anchor is therefore the attribute WE put on our own wrapper.
		* Every rule below is scoped to it, and element matching happens by tag /
		* `:where()` — no upstream class name is referenced anywhere, so a rename or
		* re-hash in the primitives package cannot silently kill this sheet.
		*
		* ## The bug this file used to have
		*
		* An earlier revision wrote the descendant scope as `[attr] [attr] *`, aiming
		* to double the attribute for specificity. That selector only matches when the
		* attribute sits on TWO DIFFERENT ancestor levels, and it sits on exactly one —
		* so the entire sheet was dead code. It parsed cleanly, looked correctly
		* scoped, and did nothing at all. The lesson is encoded in
		* `test/commit-body-styles.mjs`, which asserts these selectors MATCH the real
		* rendered DOM shape instead of merely parsing.
		*
		* ## On specificity, not just importance
		*
		* Two upstream declarations are themselves `!important`:
		*
		*   .markdown :not(pre) > code { font-size: 0.875em !important }
		*   .compact  :not(pre) > code { font-size: 1em !important }
		*
		* Against those, an `!important` at equal-or-lower specificity LOSES: CSS
		* compares importance first, then specificity, then source order. Where
		* `[attr]` counts as a class and `:not()` contributes its ARGUMENT's
		* specificity, the upstream pair sits at (0,1,2). Each rule below reaches
		* (0,2,1)+ (attribute + class/tag), clearing (0,1,2) on specificity alone —
		* no reliance on source order, hence no dependency on when this sheet is
		* injected relative to the primitives' module CSS.
		*
		* `:where()` wraps the element lists deliberately: it contributes ZERO
		* specificity, so it groups selectors without inflating the count.
		*/
		const STYLE_ID$3 = "workspace-git-commit-body-css";
		/** Scope prefix: the attribute on the wrapper we render around `<MarkdownText>`. */
		const S = "[data-workspace-git-commit-body]";
		const CSS$3 = `
${S} {
  font-size: 12px;
  line-height: 18px;
}
/* The renderer's root div: no upstream class is named, so this addresses it as
   the wrapper's own child regardless of what the bundler hashed it to. */
${S} > * {
  font-size: 12px !important;
  line-height: 18px !important;
}
/* Every descendant, so the \`font:\` shorthands and the em-based inline-code
   rule cannot re-impose their own size. (0,2,0), which beats the upstream
   (0,1,2) !important pair on specificity. */
${S} * {
  font-size: 12px !important;
  line-height: 18px !important;
}
/* Headings keep their weight and a tightened block margin so a structured body
   still reads as structured — only the type scale is flattened. */
${S} :where(h1, h2, h3, h4, h5, h6) {
  font-weight: 600 !important;
  line-height: 20px !important;
}
${S} :where(h1, h2, h3) {
  margin-top: 12px !important;
  margin-bottom: 6px !important;
}
${S} :where(h4, h5, h6) {
  margin-top: 8px !important;
  margin-bottom: 4px !important;
}
/* The markdown sheet gives headings 32px of top margin for a full document; in
   a commit body that is most of the rail. Tighten the surrounding blocks too,
   so the flattened scale does not keep document-scale whitespace. */
${S} :where(p, ul, ol, blockquote, pre, table) {
  margin-top: 6px !important;
  margin-bottom: 6px !important;
}
${S} > * > *:first-child {
  margin-top: 0 !important;
}
${S} > * > *:last-child {
  margin-bottom: 0 !important;
}
/* Code, KaTeX, and tables carry their own tokens upstream (11px code blocks,
   0.875em inline code, 13px tables, 1em KaTeX). Restated so the intent
   survives an upstream token change rather than depending on the \`*\` rule. */
${S} :where(code, pre, kbd, samp, table, th, td, .katex) {
  font-size: 12px !important;
  line-height: 18px !important;
}
`;
		/**
		* Inject (or refresh) the commit-body stylesheet.
		*
		* Idempotent and safe to call on every mount: an existing tag is rewritten in
		* place rather than appended, so an HMR re-activation does not accumulate
		* duplicate `<style>` nodes.
		*/
		function ensureCommitBodyStyles() {
			if (typeof document === "undefined") return;
			const existing = document.getElementById(STYLE_ID$3);
			if (existing !== null) {
				existing.textContent = CSS$3;
				return;
			}
			const style = document.createElement("style");
			style.id = STYLE_ID$3;
			style.textContent = CSS$3;
			document.head.appendChild(style);
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
		*
		* ## Why the subject is NOT markdown and the body IS
		*
		* The commit message is split in two: `subject` renders as plain text and
		* `body` renders through the shared `MarkdownText` primitive.
		*
		* That split is deliberate, not an oversight. Git's own convention is that the
		* subject is a single plain-text line — `git log --oneline`, every GUI, and
		* every forge treats it that way — while the body is free-form prose where
		* authors do write Markdown lists, fenced code, and links. Running the subject
		* through a Markdown renderer therefore MIS-renders it: a leading `#` becomes
		* an `<h1>` (glyph and line height jump), a leading `-` becomes a bullet with a
		* spurious marker, and a leading `>` becomes a blockquote with a left rule.
		* A message that merely starts with a dash is common; it is not a list.
		*
		* The body gets the full renderer, which is what makes fenced code blocks,
		* lists, and links in a commit body legible instead of literal punctuation.
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
			const markdownLabels = (0, react.useMemo)(() => ({
				code: {
					copyLabel: labels.markdown.copy,
					copiedLabel: labels.markdown.copied,
					toolbarLabels: {
						codeLabel: labels.markdown.code,
						wrapLabel: labels.markdown.wrap,
						unwrapLabel: labels.markdown.unwrap
					}
				},
				footnotes: labels.markdown.footnotes
			}), [
				labels.markdown.copy,
				labels.markdown.copied,
				labels.markdown.code,
				labels.markdown.wrap,
				labels.markdown.unwrap,
				labels.markdown.footnotes
			]);
			(0, react.useEffect)(() => {
				ensureCommitBodyStyles();
			}, []);
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
									marginBottom: detail.body !== "" ? 8 : 10,
									fontSize: 12,
									lineHeight: "18px",
									fontWeight: 500,
									color: "var(--dsw-alias-label-primary)"
								},
								children: detail.subject
							}),
							detail.body !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"data-workspace-git-commit-body": "",
								style: { marginBottom: 10 },
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
									text: detail.body,
									labels: markdownLabels
								})
							}) : null,
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
		//#region src/client/git-graph/filter.ts
		/** The neutral selection: everything shown. */
		const EMPTY_FILTER = Object.freeze({
			branches: [],
			tags: [],
			authors: []
		});
		/**
		* Whether a filter constrains anything.
		* @param filter - the selection to test.
		* @returns true when at least one dimension is active.
		*/
		function isFilterActive(filter) {
			return filter.branches.length > 0 || filter.tags.length > 0 || filter.authors.length > 0;
		}
		/**
		* Collect the selectable values present in one page of commits.
		*
		* Author counts are per-page by design: the dropdown offers authors the user
		* can actually see. Branches additionally merge in every short name from the
		* host `tips` map so the branch dropdown lists the whole repository, not only
		* the tips that happen to be decorated on the current page.
		* @param commits - the loaded commits.
		* @param tips - short ref name → object id, from the host `tips` method.
		* @returns branch (local then remote), tag, and author options.
		*/
		function collectFacets(commits, tips = {}) {
			const counts = /* @__PURE__ */ new Map();
			const bump = (kind, name) => {
				const id = `${kind}:${name}`;
				const existing = counts.get(id);
				if (existing === void 0) counts.set(id, {
					id,
					label: name,
					kind,
					count: 1
				});
				else existing.count += 1;
			};
			for (const commit of commits) {
				for (const ref of commit.refs) if (ref.kind === "branch") bump("branch", ref.name);
				else if (ref.kind === "remote") bump("remote", ref.name);
				else if (ref.kind === "tag") bump("tag", ref.name);
				if (commit.authorName !== null && commit.authorName !== "") bump("author", commit.authorName);
			}
			for (const name of Object.keys(tips)) {
				if (counts.has(`branch:${name}`) || counts.has(`remote:${name}`)) continue;
				const kind = name.includes("/") ? "remote" : "branch";
				counts.set(`${kind}:${name}`, {
					id: `${kind}:${name}`,
					label: name,
					kind,
					count: 0
				});
			}
			const order = {
				branch: 0,
				remote: 1,
				tag: 2,
				author: 3
			};
			return [...counts.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label, void 0, { sensitivity: "base" }));
		}
		/**
		* Resolve which commits are reachable from a set of starting hashes, walking
		* `parents` within the loaded page.
		*
		* The walk is iterative rather than recursive: history depth is unbounded and a
		* deep linear repository would otherwise be a stack-overflow risk.
		* @param commits - the loaded commits (the walk cannot leave them).
		* @param roots - hashes to start from.
		* @returns the reachable hash set.
		*/
		function reachableFrom(commits, roots) {
			const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
			const seen = /* @__PURE__ */ new Set();
			const stack = [];
			for (const root of roots) stack.push(root);
			while (stack.length > 0) {
				const hash = stack.pop();
				if (hash === void 0 || seen.has(hash)) continue;
				seen.add(hash);
				const commit = byHash.get(hash);
				if (commit === void 0) continue;
				for (const parent of commit.parents) stack.push(parent);
			}
			return seen;
		}
		/**
		* The tips of the selected branches.
		*
		* A branch is selected by NAME, but reachability needs a starting commit.
		* `tips` is the map the host resolves with `for-each-ref` (see the `tips`
		* method), and it is the ONLY reliable source: `git log --decorate` prints a
		* ref name only on the commit it points at, so in a paginated graph the tip of
		* a branch is frequently not decorated on any loaded commit. A client that
		* looked for a decoration would find nothing and filter to an empty graph.
		*
		* Falling back to decorations is still useful for a locally known ref the host
		* map has not answered for yet (or when the tips request failed): the decorated
		* commit IS the tip when it is present.
		* @param commits - the loaded commits.
		* @param branchNames - selected branch names.
		* @param tips - short ref name → object id, from the host.
		* @returns the tip hashes found, deduplicated.
		*/
		function branchTipHashes(commits, branchNames, tips = {}) {
			if (branchNames.length === 0) return [];
			const found = /* @__PURE__ */ new Set();
			const loaded = new Set(commits.map((commit) => commit.hash));
			for (const name of branchNames) {
				const resolved = tips[name];
				if (resolved !== void 0 && loaded.has(resolved)) {
					found.add(resolved);
					continue;
				}
				for (const commit of commits) if (commit.refs.some((ref) => (ref.kind === "branch" || ref.kind === "remote") && ref.name === name)) {
					found.add(commit.hash);
					break;
				}
			}
			return [...found];
		}
		/**
		* Whether one commit passes the active filter.
		*
		* Dimensions combine with AND (a commit must satisfy every active dimension),
		* while values WITHIN a dimension combine with OR (any selected branch). That
		* is the conventional reading of a facet panel and the only one that makes
		* "main + feature" and "Ada, in main" both expressible.
		*
		* Branch matching is by reachability, so it needs the reachable set computed
		* once per filter change rather than per commit — hence the precomputed
		* `context` argument.
		* @param commit - the commit to test.
		* @param filter - the active selection.
		* @param context - the precomputed reachable set for the selected branches.
		* @returns true when the commit should be shown.
		*/
		function commitMatches(commit, filter, context) {
			if (filter.branches.length > 0) {
				if (!context.reachable.has(commit.hash)) return false;
			}
			if (filter.tags.length > 0) {
				const tags = new Set(filter.tags);
				if (!commit.refs.some((ref) => ref.kind === "tag" && tags.has(ref.name))) return false;
			}
			if (filter.authors.length > 0) {
				if (commit.authorName === null || !filter.authors.includes(commit.authorName)) return false;
			}
			return true;
		}
		/**
		* Apply a filter to one page of commits.
		*
		* Returns the SAME array instance when the filter is inactive, so the pane's
		* `useMemo` on `commits` does not invalidate and the layout is not recomputed
		* for a no-op.
		* @param commits - the loaded commits.
		* @param filter - the active selection.
		* @param tips - short ref name → object id, from the host `tips` method.
		* @returns the visible commits, in the original order.
		*/
		function filterCommits(commits, filter, tips = {}) {
			if (!isFilterActive(filter)) return commits;
			const context = { reachable: reachableFrom(commits, branchTipHashes(commits, filter.branches, tips)) };
			return commits.filter((commit) => commitMatches(commit, filter, context));
		}
		/** Total number of selected values across every dimension. */
		function selectedCount(filter) {
			return filter.branches.length + filter.tags.length + filter.authors.length;
		}
		/**
		* Set the branch dimension to a single name (or clear it).
		*
		* The toolbar exposes a single-select dropdown, so the selection is always
		* zero or one branch. Tags and authors are left untouched.
		* @param filter - the current selection.
		* @param branch - the short ref name, or `null` / `''` for "all branches".
		* @returns the updated selection.
		*/
		function setFilterBranch(filter, branch) {
			const name = branch === null || branch === "" ? null : branch;
			return {
				...filter,
				branches: name === null ? [] : [name]
			};
		}
		/**
		* Set the author dimension to a single name (or clear it).
		* @param filter - the current selection.
		* @param author - the author name, or `null` / `''` for "all authors".
		* @returns the updated selection.
		*/
		function setFilterAuthor(filter, author) {
			const name = author === null || author === "" ? null : author;
			return {
				...filter,
				authors: name === null ? [] : [name]
			};
		}
		//#endregion
		//#region src/client/git-graph/GitGraphFilter.tsx
		/**
		* Branch + author filter toolbar for the commit graph.
		*
		* Two native `<select>` dropdowns sit in a compact toolbar above the commit
		* table: one for branch (local then remote), one for author ("操作者"). Native
		* selects keep the keyboard and screen-reader contract without depending on a
		* Menu primitive that closes on every click — which is the wrong interaction
		* for a facet panel, and also wrong for a single-select that should stay put
		* after a choice.
		*
		* The component is presentational: it renders whatever facets it is handed and
		* reports dimension changes upward. All filtering logic lives in `filter.ts`.
		*/
		const toolbarStyle = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: "8px",
			flex: "none",
			boxSizing: "border-box",
			padding: "6px 8px",
			borderBottom: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2))",
			minWidth: 0
		};
		const fieldStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: "6px",
			minWidth: 0,
			flex: "0 1 auto"
		};
		const labelStyle = {
			flex: "none",
			fontSize: "12px",
			color: "var(--dsw-alias-label-tertiary)",
			whiteSpace: "nowrap"
		};
		const selectStyle = {
			maxWidth: "180px",
			minWidth: "96px",
			height: "24px",
			padding: "0 6px",
			borderRadius: "4px",
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "#fff",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: "12px",
			cursor: "pointer"
		};
		const countStyle = {
			marginLeft: "auto",
			fontSize: "11px",
			color: "var(--dsw-alias-label-tertiary)",
			whiteSpace: "nowrap"
		};
		/**
		* Render the branch / author filter toolbar.
		* @param props - facets, the active filter, and their handlers.
		* @returns the toolbar with two dropdowns.
		*/
		function GitGraphFilterControl({ facets, filter, onBranchChange, onAuthorChange, onClear, shownCount, totalCount, labels }) {
			const { localBranches, remoteBranches, authors } = (0, react.useMemo)(() => ({
				localBranches: facets.filter((facet) => facet.kind === "branch"),
				remoteBranches: facets.filter((facet) => facet.kind === "remote"),
				authors: facets.filter((facet) => facet.kind === "author")
			}), [facets]);
			const hasBranchOptions = localBranches.length > 0 || remoteBranches.length > 0;
			const hasAuthorOptions = authors.length > 0;
			const hasAnyFacet = hasBranchOptions || hasAuthorOptions;
			const active = selectedCount(filter) > 0;
			const branchValue = filter.branches[0] ?? "";
			const authorValue = filter.authors[0] ?? "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-git-graph-filter": "",
				"data-git-graph-toolbar": "",
				style: toolbarStyle,
				children: !hasAnyFacet ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: "12px",
						color: "var(--dsw-alias-label-tertiary)"
					},
					children: labels.empty
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					hasBranchOptions ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						"data-git-graph-filter-branch": "",
						style: fieldStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: labelStyle,
							children: labels.branches
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": labels.branches,
							value: branchValue,
							onChange: (event) => {
								onBranchChange(event.target.value);
							},
							style: selectStyle,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: labels.none
								}),
								localBranches.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("optgroup", {
									label: labels.localBranches,
									children: localBranches.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: option.label,
										children: option.label
									}, option.id))
								}) : null,
								remoteBranches.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("optgroup", {
									label: labels.remoteBranches,
									children: remoteBranches.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: option.label,
										children: option.label
									}, option.id))
								}) : null
							]
						})]
					}) : null,
					hasAuthorOptions ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						"data-git-graph-filter-author": "",
						style: fieldStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: labelStyle,
							children: labels.authors
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": labels.authors,
							value: authorValue,
							onChange: (event) => {
								onAuthorChange(event.target.value);
							},
							style: selectStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: labels.allAuthors
							}), authors.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: option.label,
								children: option.label
							}, option.id))]
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: countStyle,
						children: labels.shown(shownCount, totalCount)
					}),
					active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-git-graph-filter-clear": "",
						onClick: onClear,
						style: {
							flex: "none",
							height: "24px",
							padding: "0 8px",
							borderRadius: "4px",
							border: "1px solid var(--dsw-alias-border-l2)",
							background: "transparent",
							color: "var(--dsw-alias-label-primary)",
							font: "inherit",
							fontSize: "12px",
							cursor: "pointer",
							whiteSpace: "nowrap"
						},
						children: labels.clear
					}) : null
				] })
			});
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
		function GitGraphPane({ commits, hasMore = false, loadingMore = false, selectedCommitHash, onSelectCommit, onLoadMore, filter, onFilterChange, refTips, branchTips, labels }) {
			const [hovered, setHovered] = (0, react.useState)(null);
			const facets = (0, react.useMemo)(() => collectFacets(commits, branchTips), [commits, branchTips]);
			const activeFilter = filter ?? EMPTY_FILTER;
			const filterOn = isFilterActive(activeFilter);
			const visibleCommits = (0, react.useMemo)(() => filterCommits(commits, activeFilter, refTips), [
				commits,
				activeFilter,
				refTips
			]);
			const layout = (0, react.useMemo)(() => layoutGitGraph(visibleCommits, { rowHeight: 30 }), [visibleCommits]);
			const graphWidth = Math.max(layout.width + 12, GRAPH_COLUMN_MIN);
			const onBranchChange = (0, react.useCallback)((branch) => {
				onFilterChange?.(setFilterBranch(activeFilter, branch));
			}, [activeFilter, onFilterChange]);
			const onAuthorChange = (0, react.useCallback)((author) => {
				onFilterChange?.(setFilterAuthor(activeFilter, author));
			}, [activeFilter, onFilterChange]);
			const onClearFilter = (0, react.useCallback)(() => {
				onFilterChange?.(EMPTY_FILTER);
			}, [onFilterChange]);
			const filterToolbar = labels.filter !== void 0 && onFilterChange !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitGraphFilterControl, {
				facets,
				filter: activeFilter,
				onBranchChange,
				onAuthorChange,
				onClear: onClearFilter,
				shownCount: visibleCommits.length,
				totalCount: commits.length,
				labels: labels.filter
			}) : null;
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
			if (visibleCommits.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-workspace-git-graph-pane": "",
				style: {
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
					flex: 1,
					overflow: "hidden",
					width: "100%"
				},
				children: [filterToolbar, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flex: "1 1 0%",
						minHeight: "240px",
						color: "var(--dsw-alias-label-tertiary)",
						fontSize: "14px",
						padding: "16px",
						textAlign: "center"
					},
					children: filterOn && labels.filter !== void 0 && commits.length > 0 ? labels.filter.noMatches : labels.empty
				})]
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
				children: [
					filterToolbar,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
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
					})
				]
			});
		}
		//#endregion
		//#region src/client/git-graph/GitGraphSplit.tsx
		/**
		* Shared graph body: list on the left; optional commit detail on the right.
		* The detail panel is closed by default and opens only when a commit is clicked.
		*
		* Layout is single-axis FLEX, mirroring ui-trajectory's split (`display:flex`
		* with a `flex:1` table pane and a `flex:none` details rail). Grid was tried
		* first and it breaks the "two independent scrollbars" contract: a
		* `grid-template-columns` track resolves against the row box, so the commit
		* list neither clipped nor scrolled and the detail pane was pushed out of the
		* viewport. Flex derives each pane's width from the space left over, which is
		* exactly what makes overflow:auto effective.
		*
		* The split also carries `container-type: inline-size` and the scrollbar
		* variables trajectory sets, so column sizing can key off the SPLIT's width
		* (container queries) instead of guessing with viewport media queries.
		*/
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
		function GitGraphSplit({ cwd, commits, hasMore, loadingMore, selectedCommitHash, onSelectCommit, onLoadMore, t, refTips, branchTips }) {
			const detailOpen = selectedCommitHash !== null && selectedCommitHash !== "";
			const [filter, setFilter] = (0, react.useState)(EMPTY_FILTER);
			const onFilterChange = (0, react.useCallback)((next) => {
				setFilter(next);
			}, []);
			(0, react.useEffect)(() => {
				if (commits.length === 0) return;
				const available = collectFacets(commits, branchTips);
				const keep = (selected, kinds) => selected.filter((name) => available.some((f) => kinds.includes(f.kind) && f.label === name));
				const keepBranches = (selected) => selected.filter((name) => available.some((f) => (f.kind === "branch" || f.kind === "remote") && f.label === name) || branchTips !== void 0 && Object.prototype.hasOwnProperty.call(branchTips, name) || refTips !== void 0 && Object.prototype.hasOwnProperty.call(refTips, name));
				setFilter((current) => {
					const next = {
						branches: keepBranches(current.branches),
						tags: keep(current.tags, ["tag"]),
						authors: keep(current.authors, ["author"])
					};
					return next.branches.length !== current.branches.length || next.tags.length !== current.tags.length || next.authors.length !== current.authors.length ? next : current;
				});
			}, [
				commits,
				branchTips,
				refTips
			]);
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
						filter,
						onFilterChange,
						refTips,
						branchTips,
						labels: {
							empty: t("gitGraphEmpty", "No commits yet"),
							loadMore: t("gitGraphLoadMore", "Load more"),
							loadingMore: t("loading", "Loading…"),
							graph: t("gitGraphColumnGraph", "Graph"),
							description: t("gitGraphColumnDescription", "Description"),
							date: t("gitGraphColumnDate", "Date"),
							author: t("gitGraphColumnAuthor", "Author"),
							commit: t("gitGraphColumnCommit", "Commit"),
							filter: {
								branches: t("gitGraphFilterBranches", "Branch"),
								localBranches: t("gitGraphFilterLocal", "Local branches"),
								remoteBranches: t("gitGraphFilterRemote", "Remote branches"),
								authors: t("gitGraphFilterAuthors", "Author"),
								clear: t("gitGraphFilterClear", "Clear filter"),
								empty: t("gitGraphFilterEmpty", "Nothing to filter by yet"),
								none: t("gitGraphFilterNone", "All branches"),
								allAuthors: t("gitGraphFilterAllAuthors", "All authors"),
								shown: (shown, total) => t("gitGraphFilterShown", "{shown} / {total} commits").replace("{shown}", String(shown)).replace("{total}", String(total)),
								noMatches: t("gitGraphFilterNoMatches", "No commits match the current filter")
							}
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
						inBranches: (n) => t("gitGraphInBranches", "In {n} refs:").replace("{n}", String(n)),
						markdown: {
							copy: t("guideCopy", "Copy"),
							copied: t("guideCopied", "Copied"),
							code: t("codeBlockTitle", "Code"),
							wrap: t("codeBlockWrap", "Wrap"),
							unwrap: t("codeBlockUnwrap", "Unwrap"),
							footnotes: t("guideFootnotes", "Footnotes")
						}
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
		function useCommitGraph(cwd, enabled, branchKey = "") {
			const [loading, setLoading] = (0, react.useState)(enabled);
			const [loadingMore, setLoadingMore] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [commits, setCommits] = (0, react.useState)([]);
			const [hasMore, setHasMore] = (0, react.useState)(false);
			const [refTips, setRefTips] = (0, react.useState)({});
			const [branchTips, setBranchTips] = (0, react.useState)({});
			const [selected, setSelected] = (0, react.useState)(null);
			const loadingMoreRef = (0, react.useRef)(false);
			const generationRef = (0, react.useRef)(0);
			const prevInputRef = (0, react.useRef)({
				cwd,
				enabled,
				branchKey
			});
			const prev = prevInputRef.current;
			if (prev.cwd !== cwd || prev.enabled !== enabled || prev.branchKey !== branchKey) {
				const cwdChanged = prev.cwd !== cwd;
				const enabledChanged = prev.enabled !== enabled;
				const branchChanged = prev.branchKey !== branchKey;
				prevInputRef.current = {
					cwd,
					enabled,
					branchKey
				};
				if (!enabled) {
					generationRef.current += 1;
					setLoading(false);
					setLoadingMore(false);
					loadingMoreRef.current = false;
				} else if (enabledChanged || cwdChanged || branchChanged) {
					generationRef.current += 1;
					setLoading(true);
					setLoadingMore(false);
					loadingMoreRef.current = false;
					setError(null);
					setCommits([]);
					setHasMore(false);
					setRefTips({});
					setBranchTips({});
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
				setRefTips({});
				setBranchTips({});
				setSelected(null);
				try {
					const [result, tipMaps] = await Promise.all([fetchCommitGraph(cwd, PAGE_SIZE, 0), fetchRefTips(cwd).catch(() => ({
						tips: {},
						branches: {}
					}))]);
					if (generation !== generationRef.current) return;
					setCommits(result.commits);
					setHasMore(result.hasMore);
					setRefTips(tipMaps.tips);
					setBranchTips(tipMaps.branches);
					setSelected(null);
				} catch (err) {
					if (generation !== generationRef.current) return;
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					if (generation === generationRef.current) setLoading(false);
				}
			}, [cwd, branchKey]);
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
				refTips,
				branchTips,
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
						t: label,
						refTips: graph.refTips,
						branchTips: graph.branchTips
					})
				})
			});
		}
		//#endregion
		//#region src/client/switchGuardStyles.ts
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
		const STYLE_ID$2 = "workspace-git-switch-guard-dialog-css";
		const CSS$2 = `
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
`;
		/** Ensure the switch-guard dialog CSS is in document.head (idempotent). */
		function ensureSwitchGuardStyles() {
			if (typeof document === "undefined") return;
			const existing = document.getElementById(STYLE_ID$2);
			if (existing !== null) {
				existing.textContent = CSS$2;
				return;
			}
			const style = document.createElement("style");
			style.id = STYLE_ID$2;
			style.textContent = CSS$2;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/BranchSelect.tsx
		/**
		* The composer's branch selector: a pill at the right of the chat input row
		* showing the workspace's current branch, opening a searchable list of the
		* repository's local and remote-tracking branches plus a "Git Graph" footer
		* action.
		*
		* Layout mirrors the shell's branch picker card:
		*   1. search field at the top ("搜索分支")
		*   2. "本地分支" / "远程分支" headings + filtered refs (default: at most 10
		*      rows per group; search raises the cap)
		*   3. create-branch + "Git 图谱" footer
		*
		* Both the pill and every row of its list lead with the branch glyph
		* ({@link BranchIcon}), so a branch is recognizable as one before its name is
		* read.
		*
		* Picking a local branch runs `git switch`; picking a remote-tracking ref
		* creates or reuses a local tracking branch. Clicking the already-current
		* branch only closes the menu. "Git Graph" opens the in-plugin commit-graph
		* dialog.
		*
		* The trigger renders NOTHING when there is no branch to show (no session cwd,
		* a directory that is not a repository, a host route that failed). The input
		* bar's trailing cluster must not gain a control for a non-repository project.
		*
		* The list itself is fetched lazily on first open: the closed trigger only needs
		* the current branch, and a repository can hold hundreds of refs.
		*/
		/**
		* How long a switch-failure notice stays visible, in milliseconds.
		*
		* A FAILED switch must not look like a no-op, which is exactly what a short
		* trigger tooltip produced: the pill kept its old name (correct — HEAD did not
		* move) and the graph stayed put (also correct), so the only evidence was a
		* `title` that required a hover and vanished after ~2.4s. The notice is now
		* rendered inline below the trigger and persists long enough to read, while
		* still clearing on its own so a stale failure cannot linger over a later
		* successful switch.
		*/
		const ERROR_FEEDBACK_MS = 12e3;
		/**
		* Default visible rows per group (local / remote) when the search box is empty.
		*
		* The host returns refs sorted by loose-ref mtime descending, but refs packed
		* into `packed-refs` carry no mtime and therefore fall back to name order — so
		* in a long-lived repository this window is "first 10 by name", not "10 most
		* recently used". The client only truncates; it cannot improve the ordering.
		*/
		const DEFAULT_VISIBLE_PER_GROUP = 10;
		/** Bound on each filtered group while searching, so a huge repo cannot flood the DOM. */
		const MAX_SEARCH_REFS = 200;
		/**
		* The cap as a CSS max-height, bounded by the viewport.
		*
		* Applied to the card AND to the scroll host inside it. The card is a
		* content-sized flex column, so a `flex: 1 1 auto` scroll host resolves
		* against the card's content height rather than the cap; passing the same cap
		* to the host means it measures itself against the cap too, in every browser
		* (no reliance on `max-height` being treated as a definite size during layout).
		*/
		const MENU_MAX_HEIGHT = `min(500px, calc(100vh - 24px))`;
		/** Stable id for the footer "Git Graph" row (never collides with a ref name). */
		const GIT_GRAPH_ID = "__git-graph__";
		/**
		* Take up to `limit` entries, always keeping the current branch when present.
		* @param list - recent-sorted refs of one kind.
		* @param limit - max rows to keep.
		*/
		function takeRecent(list, limit) {
			if (list.length <= limit) return [...list];
			const current = list.find((entry) => entry.current);
			const top = list.slice(0, limit);
			if (current === void 0 || top.some((entry) => entry.name === current.name)) return top;
			return [...top.slice(0, limit - 1), current];
		}
		/**
		* Normalize a wire ref that may predate the `kind` field.
		* @param entry - one ref from the host.
		*/
		function refKindOf(entry) {
			return entry.kind === "remote" ? "remote" : "local";
		}
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
			const [createOpen, setCreateOpen] = (0, react.useState)(false);
			const [createName, setCreateName] = (0, react.useState)("");
			const [createBusy, setCreateBusy] = (0, react.useState)(false);
			const [createError, setCreateError] = (0, react.useState)(null);
			/**
			* The pending switch parked behind the dirty-tree guard: the repository, the
			* target ref, and the status that triggered the dialog. Non-null means the
			* dialog is open.
			*
			* `path` travels WITH the target rather than being re-read from `cwd` at
			* confirm time. Both halves of that are deliberate: the guard exists to
			* describe one specific switch (so a re-derived target could confirm a
			* different one than the user was shown), and the repository to switch in is
			* part of that description (so a session change while the dialog is open
			* cannot redirect the checkout).
			*/
			const [guard, setGuard] = (0, react.useState)(null);
			const [fixedPos, setFixedPos] = (0, react.useState)(null);
			const timer = (0, react.useRef)(void 0);
			/**
			* Generation counter for the pre-switch dirty check. Only the newest click may
			* act on its result; see {@link switchTo}.
			*/
			const switchSeq = (0, react.useRef)(0);
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
				if (guard === null) return;
				ensureSwitchGuardStyles();
			}, [guard]);
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
			const grouped = (0, react.useMemo)(() => {
				const list = refs ?? [];
				const needle = query.trim().toLowerCase();
				const matched = needle === "" ? list : list.filter((entry) => entry.name.toLowerCase().includes(needle));
				const limit = needle === "" ? DEFAULT_VISIBLE_PER_GROUP : MAX_SEARCH_REFS;
				return {
					local: takeRecent(matched.filter((entry) => refKindOf(entry) === "local"), limit),
					remote: takeRecent(matched.filter((entry) => refKindOf(entry) === "remote"), limit),
					matchedCount: matched.length
				};
			}, [refs, query]);
			const menuReady = refs !== null && !loading;
			if (answer === void 0 || answer.branch === null) return null;
			const branch = answer.branch;
			const selectedName = refs?.find((entry) => entry.current)?.name;
			/**
			* Actually run the switch, in the repository at `path`.
			*
			* `path` is a PARAMETER rather than a read of `cwd` from the closure, and
			* that is load-bearing: the promise chain outlives the render that started
			* it, so a closure read would target whatever workspace was current when the
			* click happened. If the seat re-renders for another session while the guard
			* request is in flight, the checkout would land in the previous repository
			* while `store.publish` labelled the new one.
			*
			* @param path - absolute workspace directory to switch in.
			* @param name - short local name, or `remote/branch` for tracking refs.
			* @param kind - local vs remote-tracking.
			* @returns whether the switch was actually started (false = one was already
			*   in flight, so the caller must NOT assume the target was honoured).
			*/
			const performSwitch = (path, name, kind) => {
				if (switching) return false;
				setSwitching(true);
				setSwitchError(null);
				checkoutBranch(path, name, kind).then((result) => {
					store?.publish(path, {
						branch: result.branch,
						detached: false
					});
					setRefs((prev) => prev?.map((entry) => ({
						...entry,
						current: refKindOf(entry) === "local" && entry.name === result.branch
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
				return true;
			};
			/**
			* Requested switch: check the work tree for uncommitted work FIRST, and only
			* switch outright when it is clean.
			*
			* Why a pre-check instead of letting `git switch` fail: git refuses a switch
			* that would overwrite local modifications and prints its list to stderr, so
			* without this the user's only feedback is an error AFTER the fact — and for
			* the overwhelmingly common case (a dirty tree the user intends to keep) the
			* question "switch anyway, or stay?" is never even asked. Here the user sees
			* the files and decides.
			*
			* The check is best-effort: if it fails (no git binary, a network blip), we
			* fall through to the plain switch rather than blocking a legitimate action
			* behind a diagnostic that could not run. git's own refusal still protects
			* the work in that case.
			*/
			const switchTo = (name, kind) => {
				if (cwd === void 0 || cwd === "" || switching) return;
				if (kind === "local" && (name === selectedName || name === branch)) {
					close();
					return;
				}
				close();
				const path = cwd;
				const seq = ++switchSeq.current;
				fetchWorkTreeStatus(path).then((status) => {
					if (seq !== switchSeq.current) return;
					if (status.changes.length === 0) {
						performSwitch(path, name, kind);
						return;
					}
					setGuard({
						path,
						name,
						kind,
						status
					});
				}).catch(() => {
					if (seq !== switchSeq.current) return;
					performSwitch(path, name, kind);
				});
			};
			/**
			* Confirm the parked switch from the guard dialog.
			*
			* The dialog is closed FIRST so the user is not left looking at a modal that
			* no longer describes anything, but the parked target is only discarded once
			* {@link performSwitch} reports it actually started: if a switch is already in
			* flight it returns false, and dropping the target there would close the
			* dialog with no switch, no error and no busy indicator — a silent no-op.
			*/
			const confirmGuardSwitch = () => {
				if (guard === null || switching) return;
				const { path, name, kind } = guard;
				if (performSwitch(path, name, kind)) setGuard(null);
			};
			/** Dismiss the guard: keep the working tree as it is, switch nothing. */
			const cancelGuard = () => {
				setGuard(null);
			};
			const openGraph = () => {
				setGraphOpen(true);
				close();
			};
			const openCreate = () => {
				close();
				setCreateName("");
				setCreateError(null);
				setCreateOpen(true);
			};
			const cancelCreate = () => {
				setCreateOpen(false);
				setCreateName("");
				setCreateError(null);
			};
			const submitCreate = () => {
				if (cwd === void 0 || cwd === "" || createBusy) return;
				const name = createName.trim();
				if (name === "") return;
				setCreateBusy(true);
				setCreateError(null);
				createBranch(cwd, name).then((result) => {
					store?.publish(cwd, {
						branch: result.branch,
						detached: false
					});
					cancelCreate();
				}).catch((err) => {
					const message = err instanceof WorkspaceGitApiError ? err.message : err instanceof Error ? err.message : String(err);
					setCreateError(message);
				}).finally(() => {
					setCreateBusy(false);
				});
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
			const visibleCount = grouped.local.length + grouped.remote.length;
			const emptyText = (refs ?? []).length === 0 ? label("noBranches", "No branches") : label("noMatches", "No matching branches");
			const sectionCount = (grouped.local.length > 0 || visibleCount === 0 ? 1 : 0) + (grouped.remote.length > 0 ? 1 : 0);
			const itemCount = visibleCount === 0 ? 1 : sectionCount + visibleCount;
			const renderBranchRow = (entry) => {
				const kind = refKindOf(entry);
				const selected = kind === "local" && entry.name === selectedName;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					role: "menuitem",
					"data-workspace-git-branch": entry.name,
					"data-workspace-git-kind": kind,
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
						switchTo(entry.name, kind);
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
				}, `${kind}:${entry.name}`);
			};
			const sectionLabelStyle = {
				padding: "4px 10px",
				fontSize: "12px",
				lineHeight: "16px",
				color: "var(--dsw-alias-label-tertiary)"
			};
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
					maxHeight: MENU_MAX_HEIGHT,
					padding: "4px",
					display: "flex",
					flexDirection: "column",
					borderRadius: "20px",
					background: "var(--dsw-alias-bg-layer-1, #ffffff)",
					backgroundImage: "linear-gradient(var(--dsw-specific-menu), var(--dsw-specific-menu))",
					backdropFilter: "var(--dsw-menu-backdrop-filter)",
					WebkitBackdropFilter: "var(--dsw-menu-backdrop-filter)",
					boxShadow: "var(--dsw-elevation-prominent)"
				},
				onClick: (e) => {
					e.stopPropagation();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							flex: "none",
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
							flex: "none",
							height: "0.5px",
							margin: "0 2px 4px",
							background: "var(--dsw-alias-border-l1)"
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "presentation",
						style: {
							display: "flex",
							flexDirection: "column",
							flex: "1 1 auto",
							maxHeight: MENU_MAX_HEIGHT,
							minHeight: 0,
							overflowY: "auto"
						},
						children: visibleCount === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "presentation",
							style: sectionLabelStyle,
							children: label("localBranches", "Local branches")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "presentation",
							style: {
								padding: "8px 10px",
								fontSize: "13px",
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: emptyText
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [grouped.local.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "presentation",
							style: sectionLabelStyle,
							children: label("localBranches", "Local branches")
						}), grouped.local.map(renderBranchRow)] }) : null, grouped.remote.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "presentation",
							style: {
								...sectionLabelStyle,
								marginTop: grouped.local.length > 0 ? "4px" : 0
							},
							children: label("remoteBranches", "Remote branches")
						}), grouped.remote.map(renderBranchRow)] }) : null] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "presentation",
						style: {
							flex: "none",
							display: "flex",
							flexDirection: "column",
							marginTop: "4px",
							paddingTop: "4px",
							borderTop: "0.5px solid var(--dsw-alias-border-l2)"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "menuitem",
							"data-workspace-git-create-branch": "",
							style: {
								...rowStyle,
								background: "var(--dsw-alias-interactive-bg-hover)"
							},
							onClick: openCreate,
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
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NewBranchIcon, { size: 16 })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: label("createBranch", "Create and check out new branch…")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
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
						})]
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
					switchError !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"data-workspace-git-switch-error": "",
						role: "status",
						style: {
							position: "absolute",
							top: "calc(100% + 6px)",
							left: 0,
							zIndex: 30,
							maxWidth: "320px",
							padding: "6px 10px",
							borderRadius: "6px",
							border: "1px solid var(--dsw-alias-state-error-primary)",
							background: "var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2))",
							boxShadow: "0 6px 18px rgba(0, 0, 0, 0.16)",
							color: "var(--dsw-alias-state-error-primary)",
							fontSize: "12px",
							lineHeight: "17px",
							whiteSpace: "pre-wrap",
							pointerEvents: "none"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: {
								display: "block",
								marginBottom: "2px"
							},
							children: label("switchFailed", "Switch failed")
						}), switchError]
					}) : null,
					cwd !== void 0 && cwd !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitGraphDialog, {
						open: graphOpen,
						cwd,
						onClose: () => {
							setGraphOpen(false);
						},
						t
					}) : null,
					createOpen && cwd !== void 0 && cwd !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: createOpen,
						onClose: cancelCreate,
						title: label("createBranch", "Create and check out new branch…"),
						closeLabel: label("cancel", "Cancel"),
						className: "workspace-git-create-branch-dialog",
						contentClassName: "workspace-git-create-branch-modal",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							onSubmit: (e) => {
								e.preventDefault();
								submitCreate();
							},
							style: {
								display: "flex",
								flexDirection: "column",
								gap: "12px"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									autoFocus: true,
									value: createName,
									placeholder: label("createBranchPlaceholder", "New branch name"),
									"aria-label": label("createBranchPlaceholder", "New branch name"),
									onChange: (e) => {
										setCreateName(e.target.value);
										setCreateError(null);
									},
									style: {
										border: "1px solid var(--dsw-alias-border-l2)",
										borderRadius: "8px",
										background: "transparent",
										padding: "6px 10px",
										font: "inherit",
										fontSize: "14px",
										lineHeight: "22px",
										color: "var(--dsw-alias-label-primary)",
										outline: "none"
									}
								}),
								createError !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										color: "var(--dsw-alias-state-error-primary)",
										fontSize: "13px",
										lineHeight: "18px"
									},
									children: [
										label("createBranchFailed", "Create branch failed"),
										": ",
										createError
									]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										display: "flex",
										justifyContent: "flex-end",
										gap: "8px"
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "submit",
										disabled: createBusy || createName.trim() === "",
										style: {
											border: "none",
											borderRadius: "8px",
											padding: "5px 14px",
											background: "var(--dsw-alias-interactive-bg-hover)",
											color: "var(--dsw-alias-label-primary)",
											font: "inherit",
											fontSize: "14px",
											cursor: createBusy || createName.trim() === "" ? "default" : "pointer",
											opacity: createBusy || createName.trim() === "" ? .5 : 1
										},
										children: createBusy ? label("loading", "Loading…") : label("createBranchConfirm", "Create")
									})
								})
							]
						})
					}) : null,
					guard !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: true,
						onClose: cancelGuard,
						title: label("switchDirtyTitle", "Uncommitted changes"),
						closeLabel: label("cancel", "Cancel"),
						className: "workspace-git-switch-guard-dialog",
						contentClassName: "workspace-git-switch-guard-modal",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							"data-workspace-git-switch-guard": "",
							style: {
								display: "flex",
								flexDirection: "column",
								gap: "12px",
								minWidth: 0
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										fontSize: "13px",
										lineHeight: "20px",
										color: "var(--dsw-alias-label-secondary)"
									},
									children: label("switchDirtyIntro", "This workspace has uncommitted changes. Switching to \"{branch}\" may fail or carry them along.").replace("{branch}", guard.name)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-workspace-git-switch-guard-list": "",
									style: {
										maxHeight: "min(280px, 40vh)",
										overflowY: "auto",
										overscrollBehavior: "contain",
										border: "1px solid var(--dsw-alias-border-l2)",
										borderRadius: "8px",
										padding: "8px 10px",
										fontSize: "12px",
										lineHeight: 1.5,
										fontFamily: "var(--ds-font-family-code, monospace)"
									},
									children: [guard.status.changes.map((change) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-workspace-git-switch-guard-file": "",
										"data-untracked": change.untracked ? "" : void 0,
										style: {
											display: "flex",
											gap: "8px",
											alignItems: "baseline",
											minWidth: 0
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												flex: "none",
												color: change.untracked ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-warn-primary)"
											},
											children: change.untracked ? label("switchDirtyUntracked", "new") : change.status.trim() || "M"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												minWidth: 0,
												overflowWrap: "anywhere",
												color: "var(--dsw-alias-label-primary)"
											},
											children: change.path
										})]
									}, change.path)), guard.status.truncated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											color: "var(--dsw-alias-label-tertiary)",
											marginTop: "6px"
										},
										children: label("switchDirtyMore", "…and {n} more").replace("{n}", String(guard.status.total - guard.status.changes.length))
									}) : null]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										justifyContent: "flex-end",
										gap: "8px"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										"data-workspace-git-switch-guard-cancel": "",
										onClick: cancelGuard,
										style: {
											border: "1px solid var(--dsw-alias-border-l2)",
											borderRadius: "8px",
											padding: "5px 14px",
											background: "transparent",
											color: "var(--dsw-alias-label-primary)",
											font: "inherit",
											fontSize: "14px",
											cursor: "pointer"
										},
										children: label("switchDirtyCancel", "Keep my changes")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										"data-workspace-git-switch-guard-confirm": "",
										onClick: confirmGuardSwitch,
										style: {
											border: "none",
											borderRadius: "8px",
											padding: "5px 14px",
											background: "var(--dsw-alias-interactive-bg-hover)",
											color: "var(--dsw-alias-label-primary)",
											font: "inherit",
											fontSize: "14px",
											cursor: "pointer"
										},
										children: label("switchDirtyConfirm", "Switch anyway")
									})]
								})
							]
						})
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/git-graph/viewStyles.ts
		const STYLE_ID$1 = "workspace-git-graph-view-css";
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
		const CSS$1 = `
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
[data-workspace-git-graph-view] [data-git-graph-toolbar] {
  flex: none !important;
  width: 100%;
  box-sizing: border-box;
  overflow: visible;
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
			const headBranch = answer !== void 0 && answer.branch !== null ? answer.branch : "";
			const graph = useCommitGraph(cwd ?? "", graphEnabled, headBranch);
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
					t: label,
					refTips: graph.refTips,
					branchTips: graph.branchTips
				})
			});
		}
		//#endregion
		//#region src/client/agent-preset/api.ts
		/**
		* Read the roster, normalizing the one non-failure case that matters.
		*
		* `gateway/invocation-unavailable` means this deployment mounts no agent-preset
		* registry at all. That is a valid deployment rather than a failure, so it is
		* reported as an empty roster and every surface renders nothing — the same
		* reading the official plugin applies.
		*
		* @param remote - the client remote service.
		* @returns the roster, or the message to show in its place.
		*/
		async function readRoster(remote) {
			const result = await remote.agentPresets.list();
			if (result.ok) return {
				ok: true,
				value: result.value
			};
			if (result.error.code === "gateway/invocation-unavailable") return {
				ok: true,
				value: { presets: [] }
			};
			return {
				ok: false,
				error: result.error.message
			};
		}
		/**
		* Select a preset for one session.
		*
		* The refusal reason is preferred over the bare message because the Host puts
		* the human-readable cause in `error.details.reason` (for example "session is
		* running"); the message alone is generic.
		*
		* @param remote - the client remote service.
		* @param sessionId - the session to switch.
		* @param presetId - the preset to select.
		* @returns the effective preset on success, or the refusal text.
		*/
		async function selectPreset(remote, sessionId, presetId) {
			const result = await remote.agentPresets.select(sessionId, presetId);
			if (result.ok) return {
				ok: true,
				value: result.value
			};
			return {
				ok: false,
				error: refusalText$1(result.error)
			};
		}
		/**
		* Extract the human-readable refusal from a remote failure.
		* @param error - the failure envelope's error.
		* @returns the reason when the Host supplied one, else the message.
		*/
		function refusalText$1(error) {
			const details = error.details;
			if (details !== null && typeof details === "object" && "reason" in details) {
				const reason = details.reason;
				if (typeof reason === "string") return reason;
			}
			return error.message;
		}
		//#endregion
		//#region src/client/agent-preset/store.ts
		/** The state a store starts in. */
		const INITIAL = {
			status: "idle",
			options: [],
			current: "",
			error: null,
			busy: false
		};
		/**
		* One roster read shared by every surface of this plugin.
		*
		* `subscribe` mirrors the official snapshot stores, so a component re-renders
		* when a read or a selection settles.
		*/
		var AgentPresetStore = class {
			remote;
			state = INITIAL;
			listeners = /* @__PURE__ */ new Set();
			/** Only the newest read may publish after overlapping refreshes. */
			generation = 0;
			/** The roster's own default, used when no session override is known. */
			fallback = "";
			/** The active read, so concurrent callers join it instead of double-fetching. */
			inFlight;
			/**
			* @param remote - the client remote service (`ctx.remote`).
			*/
			constructor(remote) {
				this.remote = remote;
			}
			/** The current snapshot. */
			getSnapshot() {
				return this.state;
			}
			/**
			* Observe snapshot changes.
			* @param listener - called after every publish.
			* @returns the unsubscribe function.
			*/
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			set(patch) {
				this.state = {
					...this.state,
					...patch
				};
				for (const listener of this.listeners) listener();
			}
			/**
			* Read the roster. Joined by concurrent callers, so the hero chip and the
			* header label mounting together cause one request.
			*
			* @param sessionPreset - the current session's preset when it has one; the
			*   chip opens on that rather than on the roster default.
			* @returns once the snapshot reflects the Host (or the read failed).
			*/
			async load(sessionPreset) {
				if (this.inFlight !== void 0) return await this.inFlight;
				const run = this.read(sessionPreset).finally(() => {
					this.inFlight = void 0;
				});
				this.inFlight = run;
				return await run;
			}
			async read(sessionPreset) {
				const generation = ++this.generation;
				this.set({ status: "loading" });
				const roster = await readRoster(this.remote);
				if (generation !== this.generation) return;
				if (!roster.ok) {
					this.set({
						status: "unavailable",
						options: [],
						error: roster.error
					});
					return;
				}
				const { presets } = roster.value;
				if (presets.length === 0) {
					this.set({
						status: "unavailable",
						options: [],
						error: null
					});
					return;
				}
				this.fallback = presets.find((preset) => preset.isDefault)?.id ?? presets[0]?.id ?? "";
				this.set({
					status: "ready",
					error: null,
					options: presetOptions(presets),
					current: sessionPreset ?? this.fallback
				});
			}
			/**
			* Switch the session to a preset.
			*
			* The refusal text is RETURNED as well as stored: the caller that made the
			* pick is the one that has to say why it did not take (the label alone cannot
			* carry a per-pick explanation).
			*
			* @param sessionId - the session to switch.
			* @param id - the preset to select.
			* @returns the Host refusal text, or undefined once the pick settled.
			*/
			async select(sessionId, id) {
				if (this.state.busy) return void 0;
				if (id === this.state.current) return void 0;
				const previous = this.state.current;
				this.set({
					busy: true,
					error: null,
					current: id
				});
				try {
					const result = await selectPreset(this.remote, sessionId, id);
					if (!result.ok) {
						this.set({
							error: result.error,
							current: previous
						});
						return result.error;
					}
					this.set({ current: result.value });
					return;
				} finally {
					this.set({ busy: false });
				}
			}
			/** Release listeners. Called from the plugin's effect disposer. */
			dispose() {
				this.listeners.clear();
			}
		};
		/**
		* Map roster rows to selectable options, dropping entries the Host marked
		* broken — the official surface does the same, so a preset that failed to load
		* is not offered as a choice.
		* @param presets - the roster rows.
		* @returns the selectable options.
		*/
		function presetOptions(presets) {
			return presets.filter((preset) => preset.broken === void 0).map((preset) => ({
				id: preset.id,
				...preset.name === void 0 ? {} : { name: preset.name },
				...preset.description === void 0 ? {} : { description: preset.description }
			}));
		}
		//#endregion
		//#region src/client/agent-preset/AgentPresetIcon.tsx
		/**
		* The agent-preset glyph.
		* @param props - the drawn size.
		* @returns the icon element.
		*/
		function AgentPresetIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				"data-workspace-git-icon": "",
				"data-icon": "agent-preset",
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
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M128 256a42.667 42.667 0 0 1 42.667-42.667h245.333a42.667 42.667 0 0 1 0 85.334H170.667A42.667 42.667 0 0 1 128 256z m469.333 0a42.667 42.667 0 0 1 42.667-42.667h213.333a42.667 42.667 0 0 1 0 85.334H640A42.667 42.667 0 0 1 597.333 256z",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M128 512a42.667 42.667 0 0 1 42.667-42.667h85.333a42.667 42.667 0 0 1 0 85.334H170.667A42.667 42.667 0 0 1 128 512z m309.333 0a42.667 42.667 0 0 1 42.667-42.667h373.333a42.667 42.667 0 0 1 0 85.334H480A42.667 42.667 0 0 1 437.333 512z",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M128 768a42.667 42.667 0 0 1 42.667-42.667h341.333a42.667 42.667 0 0 1 0 85.334H170.667A42.667 42.667 0 0 1 128 768z m565.333 0a42.667 42.667 0 0 1 42.667-42.667h117.333a42.667 42.667 0 0 1 0 85.334H736A42.667 42.667 0 0 1 693.333 768z",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "512",
						cy: "256",
						r: "85.333",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "298.667",
						cy: "512",
						r: "85.333",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "597.333",
						cy: "768",
						r: "85.333",
						fill: "currentColor"
					})
				]
			});
		}
		//#endregion
		//#region src/client/agent-preset/labels.ts
		/**
		* Built-in presets and the locale keys of their shipped copy.
		*
		* Kept in sync with `@deepseek-ai/dsh-client-ui-agent-preset`'s
		* `BUILT_IN_PRESET_KEYS`; an id absent here falls back to the roster's own
		* metadata, which is the correct behavior for a user-authored preset (its
		* name/description must not be treated as translatable).
		*/
		const BUILT_IN_PRESET_KEYS = {
			standard: {
				name: "presetStandardName",
				description: "presetStandardDescription"
			},
			ptc: {
				name: "presetPtcName",
				description: "presetPtcDescription"
			},
			minimal: {
				name: "presetMinimalName",
				description: "presetMinimalDescription"
			},
			cordis: {
				name: "presetCordisName",
				description: "presetCordisDescription"
			}
		};
		/**
		* Whether a roster row is one of the shipped presets whose copy the dictionaries
		* carry. A shipped preset publishes no `name`; a declaration that names itself
		* owns its copy.
		* @param preset - roster row.
		*/
		function isBuiltInPreset(preset) {
			return preset.name === void 0 && BUILT_IN_PRESET_KEYS[preset.id] !== void 0;
		}
		/**
		* Resolve preset display copy without making user-authored metadata translatable.
		*
		* Mirrors the official `presetDisplayText`: built-in ids with no published name
		* take localized name AND description; anything else uses declaration metadata
		* (then its id), untranslated.
		*
		* @param preset - the preset being rendered, or undefined before a roster lands.
		* @param t - namespace-bound translator supplied by the seat.
		* @returns localized copy for a known shipped preset, otherwise declaration metadata.
		*/
		function presetDisplay(preset, t) {
			if (preset === void 0) return { name: "" };
			const keys = isBuiltInPreset(preset) ? BUILT_IN_PRESET_KEYS[preset.id] : void 0;
			if (keys !== void 0) return {
				name: t?.(keys.name) ?? preset.id,
				description: t?.(keys.description)
			};
			return {
				name: preset.name ?? preset.id,
				...preset.description === void 0 ? {} : { description: preset.description }
			};
		}
		/**
		* Resolve a preset's display name.
		*
		* @param preset - the preset being rendered, or undefined before a roster lands.
		* @param t - namespace-bound translator supplied by the seat.
		* @returns the display name.
		*/
		function presetLabel(preset, t) {
			return presetDisplay(preset, t).name;
		}
		//#endregion
		//#region src/client/agent-preset/guides.ts
		const GUIDES = {
			standard: {
				name: "presetStandardName",
				intro: "guideStandardIntro",
				explanation: "guideStandardExplanation",
				usage: "guideStandardUsage"
			},
			ptc: {
				name: "presetPtcName",
				intro: "guidePtcIntro",
				explanation: "guidePtcExplanation",
				usage: "guidePtcUsage"
			},
			minimal: {
				name: "presetMinimalName",
				intro: "guideMinimalIntro",
				explanation: "guideMinimalExplanation",
				usage: "guideMinimalUsage"
			},
			cordis: {
				name: "presetCordisName",
				intro: "guideCordisIntro",
				explanation: "guideCordisExplanation",
				usage: "guideCordisUsage"
			}
		};
		/**
		* Look up curated help for a roster id.
		* @param id - preset identifier from the roster.
		* @returns the shipped guide keys, or undefined for unknown and custom presets.
		*/
		function presetGuide(id) {
			return GUIDES[id];
		}
		//#endregion
		//#region src/client/agent-preset/PresetGuideDialog.tsx
		/**
		* Help dialog for a shipped agent preset: the same system Modal / tabs /
		* Markdown surfaces the official settings cards use for 模式说明 and 如何使用.
		*/
		const STYLE_ID = "workspace-git-preset-guide-dialog-css";
		const DIALOG_CLASS = "workspace-git-preset-guide-dialog";
		const CSS = `
.${DIALOG_CLASS} {
  width: 600px !important;
  min-width: 600px !important;
  max-width: min(600px, calc(100vw - 48px)) !important;
  box-sizing: border-box !important;
}
@media (max-width: 648px) {
  .${DIALOG_CLASS} {
    width: calc(100vw - 48px) !important;
    min-width: 0 !important;
  }
}
`;
		function ensureGuideDialogStyles() {
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
		/**
		* Open the curated guide in a system modal.
		* @param props - guide keys, starting tab, translator, close handler.
		*/
		function PresetGuideDialog({ guide, initialPage, t, onClose }) {
			const label = (key, fallback) => t?.(key) ?? fallback;
			const [page, setPage] = (0, react.useState)(initialPage);
			const guideId = (0, react.useId)();
			(0, react.useEffect)(() => {
				setPage(initialPage);
			}, [initialPage, guide]);
			const title = label(guide.name, guide.name);
			const markdownLabels = {
				code: {
					copyLabel: label("guideCopy", "Copy"),
					copiedLabel: label("guideCopied", "Copied"),
					toolbarLabels: {
						codeLabel: label("codeBlockTitle", "Code"),
						wrapLabel: label("codeBlockWrap", "Wrap"),
						unwrapLabel: label("codeBlockUnwrap", "Unwrap")
					}
				},
				footnotes: label("guideFootnotes", "Footnotes")
			};
			(0, react.useEffect)(() => {
				ensureGuideDialogStyles();
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title,
				description: label(guide.intro, ""),
				closeLabel: label("close", "Close"),
				className: DIALOG_CLASS,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-workspace-git-preset-guide": "",
					style: {
						display: "flex",
						flexDirection: "column",
						gap: "12px",
						minWidth: 0,
						minHeight: 0
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedTabs, {
						label: label("guideSections", "Guide sections"),
						value: page,
						onChange: setPage,
						items: [{
							value: "explanation",
							label: label("modeExplanation", "Mode details"),
							id: `${guideId}-explanation-tab`,
							panelId: `${guideId}-explanation-panel`
						}, {
							value: "usage",
							label: label("howToUse", "How to use"),
							id: `${guideId}-usage-tab`,
							panelId: `${guideId}-usage-panel`
						}]
					}), ["explanation", "usage"].map((section) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: `${guideId}-${section}-panel`,
						role: "tabpanel",
						"aria-labelledby": `${guideId}-${section}-tab`,
						hidden: page !== section,
						tabIndex: 0,
						style: { minWidth: 0 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
							text: label(guide[section], ""),
							labels: markdownLabels
						})
					}, section))]
				})
			});
		}
		//#endregion
		//#region src/client/agent-preset/AgentPresetChip.tsx
		/**
		* The agent-preset chip for `conversation.hero.agentPreset` — the seat the
		* shell renders directly after `conversation.hero.workspace` ("选择工作区").
		*
		* This is the plugin's answer to the hard gate in the official client plugin:
		* `AgentPresetSeat` returns null unless General → Developer tools is on
		* (`ap-client.js:480`), and because that seat is a `single` slot the official
		* registrant keeps the position while rendering nothing. We therefore cannot
		* make the official component appear and must not add a second occupant of a
		* `single` seat — but we CAN read the same Host roster and draw the control,
		* which is what this component does. The user-visible result is the selector
		* sitting beside 选择工作区, with Developer tools either on or off.
		*
		* Independence from the official plugin is deliberate and total: no shared
		* store, no shared component, no import from `dsh-client-ui-agent-preset`. The
		* only shared dependency is the Host remote namespace both read.
		*
		* HOW IT SHARES THE SEAT. The seat is `single`, so two registrations at the
		* same priority would THROW at load; this chip therefore registers at
		* `priority: -1` (the documented shadowing rank, lowest renders) to coexist
		* with the official entry and win the cell. Winning the cell is exclusive:
		* returning null does NOT reveal the official occupant — it empties the seat.
		* This chip therefore always paints when the roster is ready, whether or not
		* General → Developer tools is on. The official chip is gated to null when
		* that setting is off, and is shadowed by this cell when the setting is on.
		*
		* Deliberately NOT copied from the official chip: its per-character intro
		* animation and its staged "the NEXT session gets this preset" model. Staging
		* exists because the official chip owns the unbound new-session screen; this
		* plugin's chip switches the session it is actually attached to, which is the
		* behavior that matches what the user sees beside the workspace they picked.
		*
		* ## The switchable precondition (`blank`)
		*
		* A preset change is accepted only by a session that has not run yet. The Host
		* refuses to adopt an existing session under a different preset — a running
		* session keeps the composition it began with — so this chip gates on
		* `session.blank`, the same field the official controller guards on
		* (`ap-client.js`, `AgentPresetSeatController.apply`).
		*
		* Gating BEFORE the call is the point: the earlier version only checked that a
		* session id existed, so on a session that had already taken a turn it really
		* did issue `select` and ate the Host's refusal, leaning on the store's
		* optimistic update and rollback to recover. The refusal was survivable, but the
		* request was pointless. The comparison is `=== true` so an absent `blank`
		* (thinner session list) reads as "not switchable", never as "switchable".
		*/
		/** How long a refusal toast stays up, in milliseconds. */
		const REFUSAL_HOLD_MS = 8e3;
		const MENU_STYLE_ID = "workspace-git-preset-menu-css";
		const MENU_LIST_CLASS = "workspace-git-preset-menu";
		const MENU_CSS = `
.${MENU_LIST_CLASS} {
  background: #fff !important;
  width: 330px !important;
  max-width: 330px !important;
}
.${MENU_LIST_CLASS} [data-workspace-git-preset-row]:not(:last-child) {
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.${MENU_LIST_CLASS} [data-workspace-git-preset-row] {
  border-radius: var(--dsw-radius-md);
}
.${MENU_LIST_CLASS} [data-workspace-git-preset-row]:hover,
.${MENU_LIST_CLASS} [data-workspace-git-preset-row]:has([role="menuitem"]:focus-visible) {
  background: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover) 40%, #fff);
}
.${MENU_LIST_CLASS} [role="menuitem"]:hover:not(:disabled),
.${MENU_LIST_CLASS} [role="menuitem"]:focus-visible:not(:disabled) {
  background: transparent !important;
}
.${MENU_LIST_CLASS} [role="menuitem"] {
  align-items: flex-start;
  height: auto !important;
  max-height: none !important;
  min-height: 0 !important;
  white-space: normal;
}
.${MENU_LIST_CLASS} [role="menuitem"] > span {
  overflow: visible !important;
  text-overflow: unset !important;
  white-space: normal !important;
  height: auto !important;
  max-height: none !important;
}
`;
		function ensurePresetMenuStyles() {
			if (typeof document === "undefined") return;
			const existing = document.getElementById(MENU_STYLE_ID);
			if (existing !== null) {
				existing.textContent = MENU_CSS;
				return;
			}
			const style = document.createElement("style");
			style.id = MENU_STYLE_ID;
			style.textContent = MENU_CSS;
			document.head.appendChild(style);
		}
		/**
		* The chip.
		* @param props - the composed slot props.
		* @returns the chip and its menu, or null when there is nothing to show.
		*/
		function AgentPresetChip({ sessionId, useSessions, t, store }) {
			const projected = useSessions?.((state) => {
				if (sessionId === void 0) return void 0;
				const value = state.byId[sessionId]?.projectionValues?.agentPreset;
				return typeof value === "string" ? value : void 0;
			});
			const sessionPreset = projected === "" ? void 0 : projected;
			const sessionBlank = useSessions?.((state) => {
				if (sessionId === void 0) return false;
				return state.byId[sessionId]?.blank === true;
			}) ?? false;
			const [open, setOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				ensurePresetMenuStyles();
			}, []);
			const [guide, setGuide] = (0, react.useState)(null);
			const [toast, setToast] = (0, react.useState)(null);
			const toastSeq = (0, react.useRef)(0);
			const [revision, setRevision] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				if (store === void 0) return;
				return store.subscribe(() => {
					setRevision((value) => value + 1);
				});
			}, [store]);
			(0, react.useEffect)(() => {
				if (store === void 0) return;
				store.load(sessionPreset);
			}, [store, sessionPreset]);
			if (store === void 0) return null;
			const label = (key, fallback) => t?.(key) ?? fallback;
			const state = store.getSnapshot();
			if (state.status === "unavailable" || state.options.length === 0) return null;
			const current = state.options.find((option) => option.id === state.current);
			if ((current?.id ?? (state.current === "" ? void 0 : state.current)) === void 0) return null;
			const canSwitch = sessionId !== void 0 && sessionId !== "" && sessionBlank;
			const pick = (id) => {
				setOpen(false);
				if (!canSwitch || store === void 0) return;
				store.select(sessionId, id).then((refusal) => {
					if (refusal === void 0) return;
					toastSeq.current += 1;
					setToast(label("switchRefused", "Could not switch to {name}: {reason}").replace("{name}", presetLabel(current, t)).replace("{reason}", refusal));
				});
			};
			const openHelp = (id, page) => {
				setOpen(false);
				setGuide({
					id,
					page
				});
			};
			const helpStyle = {
				border: 0,
				background: "transparent",
				padding: 0,
				color: "var(--dsw-alias-label-tertiary)",
				font: "inherit",
				fontSize: "12px",
				lineHeight: "16px",
				cursor: "pointer"
			};
			const activeGuide = guide === null ? void 0 : presetGuide(guide.id);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open,
					onClose: () => {
						setOpen(false);
					},
					align: "start",
					portal: true,
					selectedId: state.current,
					listClassName: MENU_LIST_CLASS,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						"data-workspace-git-agent-preset": "",
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-label": `${label("agentPreset", "Agent preset")}: ${presetLabel(current, t)}`,
						title: state.error ?? (canSwitch ? label("seatHint", "Choose the agent preset for your new task") : label("lockedHint", "This session already started with a preset")),
						disabled: state.busy || !canSwitch,
						onClick: () => {
							setOpen((value) => !value);
						},
						onMouseEnter: (e) => {
							e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
						},
						onMouseLeave: (e) => {
							e.currentTarget.style.background = e.currentTarget.getAttribute("aria-expanded") === "true" ? "var(--dsw-alias-interactive-bg-hover)" : "transparent";
						},
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: "4px",
							maxWidth: "220px",
							minHeight: "28px",
							height: "28px",
							padding: "0 8px",
							border: "none",
							outline: "none",
							boxShadow: "none",
							borderRadius: "var(--dsw-radius-sm)",
							background: open ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
							color: "var(--dsw-alias-label-secondary)",
							font: "inherit",
							fontSize: "13px",
							fontWeight: 500,
							lineHeight: "20px",
							cursor: state.busy || !canSwitch ? "default" : "pointer",
							opacity: state.busy || !canSwitch ? .6 : 1
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									display: "inline-flex",
									alignItems: "center",
									color: "inherit",
									flex: "none"
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AgentPresetIcon, { size: 15 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: presetLabel(current, t)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									flex: "none",
									fontSize: "10px",
									opacity: .7
								},
								children: "▾"
							})
						]
					}),
					children: state.options.map((option) => {
						const text = presetDisplay(option, t);
						const help = presetGuide(option.id);
						const selected = option.id === state.current;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							"data-workspace-git-preset-row": option.id,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuItemButton, {
								disabled: state.busy || !canSwitch,
								onSelect: () => {
									pick(option.id);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: "2px",
										minWidth: 0,
										width: "100%",
										height: "auto",
										overflow: "visible",
										whiteSpace: "normal"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											fontSize: "14px",
											lineHeight: "20px",
											whiteSpace: "normal",
											overflowWrap: "anywhere"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { fontWeight: 600 },
											children: text.name
										}), selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
											tone: "info",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"data-workspace-git-preset-selected": "",
												children: label("selectedTag", "Selected")
											})
										})] }) : null]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: "12px",
											lineHeight: "16px",
											color: "var(--dsw-alias-label-tertiary)",
											whiteSpace: "normal",
											overflowWrap: "anywhere"
										},
										children: text.description ?? label("noDescription", "No description.")
									})]
								})
							}), help === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: "12px",
									padding: "0 8px 8px"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-workspace-git-preset-guide": "explanation",
									"aria-label": `${label("modeExplanation", "Mode details")}: ${text.name}`,
									style: helpStyle,
									onClick: (event) => {
										event.stopPropagation();
										openHelp(option.id, "explanation");
									},
									children: label("modeExplanation", "Mode details")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-workspace-git-preset-guide": "usage",
									"aria-label": `${label("howToUse", "How to use")}: ${text.name}`,
									style: helpStyle,
									onClick: (event) => {
										event.stopPropagation();
										openHelp(option.id, "usage");
									},
									children: label("howToUse", "How to use")
								})]
							})]
						}, option.id);
					})
				}),
				activeGuide !== void 0 && guide !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PresetGuideDialog, {
					guide: activeGuide,
					initialPage: guide.page,
					t,
					onClose: () => {
						setGuide(null);
					}
				}) : null,
				toast !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
					text: toast,
					holdMs: REFUSAL_HOLD_MS,
					anchor: document.querySelector("[data-composer-card]"),
					onDone: () => {
						setToast(null);
					}
				}, toastSeq.current) : null
			] });
		}
		//#endregion
		//#region src/client/prompt-enhance/EnhanceIcon.tsx
		/**
		* The prompt-enhancer glyph: sparkle + diagonal stroke.
		* @param props - the drawn size.
		* @returns the icon element.
		*/
		function EnhanceIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				"data-workspace-git-icon": "",
				"data-icon": "prompt-enhance",
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
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					fill: "currentColor",
					fillOpacity: "0.7",
					transform: "matrix(1 0 0 1 0.524459 0.757238)",
					d: "M6.1838 2.2198C6.6022 1.3093 7.8641 1.2266 8.1057 2.0938L8.84 4.7335C8.992 5.2783 9.3896 5.6893 9.929 5.8595L12.5432 6.6827C13.4014 6.9536 13.2757 8.2113 12.3517 8.5987L9.9973 9.5861L9.8362 9.6583C9.0366 10.0399 8.3731 10.7089 8.0031 11.5138L6.9377 13.8341L6.8488 13.9943C6.3971 14.7003 5.39 14.7669 5.0735 14.1115L5.0158 13.9601L4.2815 11.3205C4.1485 10.8435 3.8277 10.4679 3.3879 10.2677L3.1916 10.1935L0.5783 9.3712C-0.2801 9.1005 -0.155 7.8418 0.7687 7.4542L3.1242 6.4679C3.9412 6.1253 4.632 5.4846 5.0403 4.6983L5.1183 4.5392L6.1838 2.2198ZM6.2004 4.88C5.652 6.0736 4.6394 7.0538 3.4279 7.5616L1.5295 8.3565L3.719 9.046C4.5745 9.3157 5.2059 9.9689 5.4465 10.8331L6.0608 13.0431L6.9201 11.174C7.4685 9.9802 8.4821 9.0001 9.6935 8.4923L11.591 7.6964L9.4025 7.0069C8.547 6.7373 7.9156 6.085 7.675 5.2208L7.0598 3.0099L6.2004 4.88ZM12.7072 0.214C12.8295 -0.052 13.198 -0.0764 13.2687 0.1768L13.6194 1.4395C13.6415 1.5192 13.7005 1.5797 13.7795 1.6046L15.0285 1.9981C15.2795 2.0772 15.243 2.4445 14.9728 2.5577L13.6281 3.1212C13.5431 3.1568 13.4722 3.226 13.4338 3.3097L12.8254 4.6349C12.703 4.9009 12.3344 4.9245 12.2639 4.671L11.9124 3.4093C11.8901 3.3296 11.8319 3.2691 11.7531 3.2442L10.5031 2.8507C10.2522 2.7715 10.2888 2.4045 10.5588 2.2911L11.9035 1.7267C11.9884 1.6911 12.0593 1.6228 12.0978 1.5392L12.7072 0.214Z"
				})
			});
		}
		/**
		* The in-flight spinner: a ~270° arc rotating once per second.
		*
		* The same mark WorkBuddy swaps in while enhancing (component `hV` there): an
		* `r=6` circle with `strokeDasharray: 28 10`, so a little over half the
		* circumference is drawn and the open remainder is what makes the rotation read
		* as motion instead of a static ring.
		*
		* The rotation is an inline `animation` plus a co-located `<style>` rule rather
		* than a stylesheet: this plugin ships no CSS, and one keyframe does not justify
		* adding a sheet or a global class namespace. The rule is namespaced
		* (`dsw-`) and the `prefers-reduced-motion` branch holds the arc still, because
		* endless rotation is exactly the motion that setting exists to suppress.
		* @param props - the drawn size.
		* @returns the spinner element.
		*/
		function EnhanceSpinner({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				"data-workspace-git-icon": "",
				"data-icon": "prompt-enhance-spinner",
				style: {
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					flex: "none",
					animation: "dsw-enhance-spin 1s linear infinite"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
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
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "8",
						cy: "8",
						r: "6",
						stroke: "currentColor",
						strokeWidth: "2",
						strokeLinecap: "round",
						strokeDasharray: "28 10"
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: "@keyframes dsw-enhance-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){[data-icon=\"prompt-enhance-spinner\"]{animation:none}}" })]
			});
		}
		//#endregion
		//#region src/client/prompt-enhance/PromptEnhancer.tsx
		/**
		* The prompt-enhancer control: one icon button in the composer's left cluster.
		*
		* ## Why this seat
		*
		* It registers into `conversation.input.right` — the compact-control run in the
		* composer's TRAILING cluster, which `ui-conversation` renders immediately left
		* of the model selector. It deliberately does NOT sit in `conversation.input.left`
		* beside the branch pill: that cluster and the model selector are separate
		* containers, so the rightmost occupant of `input.left` is still a whole cluster
		* away from the picker. The runtime's own contract for this seat reads
		* "Compact controls before the composer submit action" and it is a `list`, so
		* nothing has to be shadowed — unlike `conversation.input.model`, a `single`
		* seat the official picker holds at priority 0.
		*
		* ## How the draft is read and written
		*
		* `ui-conversation` publishes `uiSession.provide({ hooks: ["input"], props:
		* ["inputActions"] })`. The slot runtime materializes those per session, so this
		* component receives `useInput` (a selector hook over the draft state) and
		* `inputActions` (`setDraft`) as ordinary props — the same two props `InputBar`
		* itself takes. No DOM access, no textarea ref, no React internals.
		*
		* ## Failure is visible, never destructive
		*
		* The one rule this control must never break: the user's text survives. The
		* rewrite is only written on success, and every failure path leaves the draft
		* exactly as it was and shows why. Editing continues to work while a request is
		* in flight; the result overwrites whatever is there when it lands, which is
		* the behavior this plugin was asked for.
		*
		* ## In flight looks in flight
		*
		* While a request is running the glyph is swapped for a spinner. Disabling the
		* button alone is not enough feedback: a disabled icon that never changes reads
		* as a dead control, not a pending one, and a rewrite takes seconds.
		*/
		/**
		* Human-readable text for one refusal code.
		*
		* Kept local rather than translated key-by-key: these are diagnostics for a
		* deliberate user action, and a code with no entry still reads correctly via
		* the fallback below.
		*
		* The fallback names the code rather than saying only "enhancement failed".
		* A generic message is a dead end: `internal` and `network` are different
		* problems with different fixes, and the user is the one who can see the DevTools
		* network panel this text points them at.
		* @param code - the machine code from the API envelope.
		* @param message - the server's own message, appended when it adds detail.
		* @param t - the namespace translator.
		* @returns the message to show.
		*/
		function refusalText(code, message, t) {
			switch (code) {
				case "empty-draft": return t("enhanceEmpty");
				case "draft-too-large": return t("enhanceTooLarge");
				case "session-not-found": return t("enhanceNoSession");
				case "no-model": return t("enhanceNoModel");
				case "no-llm": return t("enhanceNoService");
				case "timeout": return t("enhanceTimeout");
				case "truncated": return t("enhanceTruncated");
				case "empty-result": return t("enhanceEmptyResult");
				case "model-error": return t("enhanceModelError");
				case "network": return t("enhanceNetwork");
				default: {
					const detail = message === void 0 || message === "" ? code : `${code}: ${message}`;
					return `${t("enhanceFailed")} (${detail})`;
				}
			}
		}
		/**
		* The enhancer button.
		* @param props - the composed slot props.
		* @returns the button, or null when the composer face is unavailable.
		*/
		function PromptEnhancer({ sessionId, useInput, inputActions, t }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [toast, setToast] = (0, react.useState)(null);
			const [toastSeq, setToastSeq] = (0, react.useState)(0);
			const inFlight = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => {
				inFlight.current?.abort();
			}, []);
			const label = (key, fallback) => {
				const translated = t?.(key);
				return translated === void 0 || translated === key ? fallback : translated;
			};
			const draft = useInput?.((state) => typeof state.draft === "string" ? state.draft : "") ?? "";
			const phase = useInput?.((state) => state.phase) ?? void 0;
			const writable = inputActions?.setDraft !== void 0;
			const submitting = phase === "submitting" || phase === "adjudicating";
			const empty = draft.trim() === "";
			if (sessionId === void 0 || !writable) return null;
			const run = async () => {
				if (busy || submitting || empty) return;
				const raw = draft;
				const controller = new AbortController();
				inFlight.current = controller;
				setBusy(true);
				try {
					const result = await enhancePrompt(sessionId, raw, controller.signal);
					inputActions.setDraft?.(result.draft);
				} catch (error) {
					if (controller.signal.aborted) return;
					const code = error instanceof WorkspaceGitApiError ? error.code : "unknown";
					const message = error instanceof WorkspaceGitApiError ? error.message : error instanceof Error ? error.message : void 0;
					setToastSeq((value) => value + 1);
					setToast(refusalText(code, message, (key) => label(key, "Could not enhance the prompt.")));
				} finally {
					if (inFlight.current === controller) inFlight.current = null;
					setBusy(false);
				}
			};
			const title = busy ? label("enhanceBusy", "Enhancing…") : label("enhanceTitle", "Enhance this prompt with the model");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				"data-workspace-git-prompt-enhance": "",
				"data-enhance-state": busy ? "busy" : "idle",
				"aria-label": title,
				title,
				"aria-busy": busy || void 0,
				disabled: busy || submitting || empty,
				onClick: () => {
					run();
				},
				onMouseEnter: (e) => {
					if (busy || submitting || empty) return;
					e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, #f1f1f1)";
				},
				onMouseLeave: (e) => {
					e.currentTarget.style.background = "transparent";
				},
				style: {
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					width: 28,
					height: 28,
					padding: 0,
					border: 0,
					borderRadius: "999px",
					background: "transparent",
					color: "var(--dsw-alias-label-secondary)",
					cursor: busy || submitting || empty ? "default" : "pointer",
					opacity: empty ? .4 : 1,
					flex: "none"
				},
				children: busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnhanceSpinner, { size: 15 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnhanceIcon, { size: 15 })
			}), toast === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
				text: toast,
				anchor: document.querySelector("[data-composer-card]"),
				onDone: () => {
					setToast(null);
				}
			}, toastSeq)] });
		}
		//#endregion
		//#region src/client/agent-preset/AgentPresetLabel.tsx
		/**
		* The agent-preset label for `conversation.session.header.actions` — the
		* session header's action row, where the official plugin also puts a read-only
		* preset label (at order -10, so it sits leftmost).
		*
		* Read-only by design, and that is not a limitation of this plugin: switching a
		* preset is a session-creation-time decision on the Host, and the header is
		* showing a session that already runs. The chip on the hero screen is the
		* control; this is the ambient reminder of which preset the session you are
		* looking at is running.
		*
		* Order -10 matches the official registrant, so if both are ever visible the
		* two labels group together at the left of the action row instead of
		* interleaving with the other actions. The slot is a `list`, so unlike the hero
		* seat there is no single-occupant conflict — registering here is safe
		* regardless of the official plugin.
		*/
		/**
		* The label.
		* @param props - the composed slot props.
		* @returns the label, or null when no roster/preset is known.
		*/
		function AgentPresetLabel({ sessionId, useSessions, t, store, developerTools }) {
			const [revision, setRevision] = (0, react.useState)(0);
			const [developerToolsOn, setDeveloperToolsOn] = (0, react.useState)(() => developerTools?.getSnapshot() ?? false);
			const sessionPreset = useSessions?.((state) => {
				if (sessionId === void 0) return void 0;
				const value = state.byId[sessionId]?.projectionValues?.agentPreset;
				return typeof value === "string" && value !== "" ? value : void 0;
			});
			(0, react.useEffect)(() => {
				if (store === void 0) return;
				return store.subscribe(() => {
					setRevision((value) => value + 1);
				});
			}, [store]);
			(0, react.useEffect)(() => {
				if (developerTools === void 0) return;
				setDeveloperToolsOn(developerTools.getSnapshot());
				return developerTools.subscribe(() => {
					setDeveloperToolsOn(developerTools.getSnapshot());
				});
			}, [developerTools]);
			(0, react.useEffect)(() => {
				if (store === void 0) return;
				store.load(sessionPreset);
			}, [store, sessionPreset]);
			if (developerToolsOn) return null;
			if (store === void 0) return null;
			const state = store.getSnapshot();
			if (state.status !== "ready" || state.options.length === 0) return null;
			const current = state.options.find((option) => option.id === state.current);
			if (current === void 0) return null;
			const label = (key, fallback) => t?.(key) ?? fallback;
			const hint = `${label("agentPresetHint", "Agent preset for this session")}: ${presetLabel(current, t)}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				"data-workspace-git-agent-preset-label": "",
				title: hint,
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: "5px",
					height: "24px",
					padding: "0 8px",
					borderRadius: "999px",
					background: "var(--dsw-alias-bg-module-platform)",
					color: "var(--dsw-alias-label-secondary)",
					fontSize: "12px",
					lineHeight: "16px",
					maxWidth: "180px"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					style: {
						display: "inline-flex",
						alignItems: "center",
						flex: "none",
						color: "inherit"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AgentPresetIcon, { size: 13 })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: presetLabel(current, t)
				})]
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
			localBranches: "本地分支",
			remoteBranches: "远程分支",
			openMenu: "查看分支列表",
			switching: "切换中…",
			switchFailed: "切换失败",
			createBranch: "创建并检查新分支…",
			createBranchPlaceholder: "新分支名称",
			createBranchConfirm: "创建",
			createBranchFailed: "创建分支失败",
			switchDirtyTitle: "有未提交的改动",
			switchDirtyIntro: "该工作区存在未提交的改动。切换到「{branch}」可能失败，或把这些改动一起带过去。",
			switchDirtyUntracked: "新文件",
			switchDirtyMore: "…还有 {n} 个",
			switchDirtyCancel: "保留我的改动",
			switchDirtyConfirm: "仍然切换",
			cancel: "取消",
			detached: "游离 HEAD",
			loading: "加载中…",
			noBranches: "没有分支",
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
			gitGraphFilter: "筛选",
			gitGraphFilterBranches: "分支",
			gitGraphFilterLocal: "本地分支",
			gitGraphFilterRemote: "远程分支",
			gitGraphFilterTags: "标签",
			gitGraphFilterAuthors: "操作者",
			gitGraphFilterAllAuthors: "全部操作者",
			gitGraphFilterClear: "清除筛选",
			gitGraphFilterEmpty: "暂无可筛选的条目",
			gitGraphFilterNone: "全部分支",
			gitGraphFilterActive: "已筛选 {n} 项",
			gitGraphFilterShown: "{shown} / {total} 条提交",
			gitGraphFilterNoMatches: "没有符合当前筛选的提交",
			close: "关闭",
			agentPreset: "Agent 预设",
			agentPresetHint: "本会话使用的 Agent 预设",
			seatHint: "选择新任务使用的 Agent 预设",
			lockedHint: "本会话已按某个预设开始，无法更改",
			noDescription: "暂无描述。",
			selectedTag: "已选择",
			switchRefused: "无法切换到「{name}」：{reason}",
			enhanceTitle: "用模型润色并结构化这条提示词",
			enhanceBusy: "正在增强…",
			enhanceEmpty: "输入框是空的，没有可增强的内容。",
			enhanceTooLarge: "内容太长，无法增强。",
			enhanceNoSession: "该会话已关闭。",
			enhanceNoModel: "该会话尚未选择模型。",
			enhanceNoService: "当前部署没有可用的模型服务。",
			enhanceTimeout: "模型响应超时，请重试。",
			enhanceTruncated: "增强结果被截断，未写回输入框。",
			enhanceEmptyResult: "模型没有返回可用内容。",
			enhanceModelError: "模型调用失败，请重试。",
			enhanceNetwork: "无法连接增强服务，请检查网络后重试。",
			enhanceFailed: "增强失败，输入框内容未改动。",
			presetStandardName: "标准模式",
			presetStandardDescription: "处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。",
			presetPtcName: "PTC 模式",
			presetPtcDescription: "包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。",
			presetMinimalName: "极简模式",
			presetMinimalDescription: "Agent 仅使用终端工具完成任务，适合测试和对比其基础表现。",
			presetCordisName: "创造模式",
			presetCordisDescription: "用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。",
			modeExplanation: "模式说明",
			howToUse: "如何使用",
			guideSections: "帮助内容",
			guideCopy: "复制",
			guideCopied: "已复制",
			guideFootnotes: "脚注",
			codeBlockTitle: "代码",
			codeBlockWrap: "换行",
			codeBlockUnwrap: "不换行",
			guideStandardIntro: "新建任务时选择「标准模式」，说明要完成什么、相关文件在哪里，以及怎样判断任务完成。",
			guideStandardExplanation: [
				"### 工作方式",
				"Agent 直接调用工具来读写文件、检索资料和执行终端命令。包含 Skills、计划、目标、子 Agent、工作流和上下文压缩等能力。",
				"### 什么时候选",
				"日常编程、文件处理和资料整理可以从这里开始。标准模式也能编写脚本、批量处理文件；PTC 改变的是工具调用方式，批量任务并不必须使用 PTC。"
			].join("\n\n"),
			guideStandardUsage: [
				"### 修复一个问题",
				"> 搜索表单连续提交两次后，结果会消失。请定位原因、修复问题并运行相关测试，最后说明原因和修改内容。",
				"预期产出：代码修改、相关测试结果，以及问题原因说明。",
				"### 整理项目资料",
				"> 阅读项目中的 Markdown 记录，整理已经达成的结论和仍待确认的问题，并附上对应文件链接。",
				"预期产出：一份带来源引用的总结，方便回到原文核对。"
			].join("\n\n"),
			guidePtcIntro: "新建任务时选择「PTC 模式」，说明输入文件、处理规则和输出格式。代码由 Agent 编写。",
			guidePtcExplanation: [
				"### 怎样调用工具",
				"PTC 是 Programmatic Tool Calling，即通过程序调用工具。当前内置预设让 Agent 通过 run_code 编写 TypeScript 程序，使用生成的工具 SDK 发起调用。程序可以组织循环、条件判断、错误处理，以及适合并发执行的调用。",
				"### 哪些结果交给模型",
				"工具返回的数据先交给程序，经过筛选、计算或合并，再通过输出或返回值交给模型；图片结果会另行附加。程序中的工具调用仍会被记录，也仍受工具权限约束。",
				"### 与标准模式的区别",
				"两种模式都能编程、批量处理文件。标准模式直接向模型提供各个工具；PTC 让模型用代码组织工具调用。当前 PTC 预设未启用 workflow 工具。速度和 token 用量取决于具体任务与结果处理方式。"
			].join("\n\n"),
			guidePtcUsage: [
				"### 批量检查配置文件",
				"> 检查 configs/ 下所有 JSON 文件，按照 schema.json 找出缺失字段和不合法的值。每个问题写成 CSV 中的一行；读取失败的文件也记入报告，继续检查其余文件。保留原文件。",
				"预期产出：问题汇总和一份 CSV 报告。程序可以对多份文件执行相同检查，处理单个文件的失败，再汇总结果。",
				"### 汇总错误日志",
				"> 分析 logs/ 下的日志，按服务和错误类型统计次数，列出出现最多的十类错误，每类保留一条示例。完整统计另存为 CSV。",
				"预期产出：高频错误摘要和完整统计表。中间数据可以先在程序中聚合，再把汇总交给模型。"
			].join("\n\n"),
			guideMinimalIntro: "新建任务时选择「极简模式」。做对照测试时，保持模型、权限、任务输入和工作区起始状态一致。",
			guideMinimalExplanation: [
				"### 保留哪些能力",
				"仅提供一个持久 Shell 工具，并使用固定系统提示词。内置预设不加载 Skills、计划、上下文压缩，也不注入标准运行时上下文。",
				"### 什么时候选",
				"适合作为实验和对照测试的基线。Agent 仍能通过终端命令读写文件、运行脚本，但缺少管理长任务的内置辅助能力。工具少，不代表对新手更容易。"
			].join("\n\n"),
			guideMinimalUsage: [
				"### 对比基础修复表现",
				"> 运行这个项目的测试，找出失败原因，做最小修复，再运行相关测试并报告结果。",
				"分别用标准模式和极简模式，从相同的工作区状态执行这条任务，对比完成情况、工具调用和最终修改。极简模式会通过终端命令完成这些操作。"
			].join("\n\n"),
			guideCordisIntro: "新建任务时选择「创造模式」，说明希望增加什么能力、从哪里使用，以及怎样验证效果。",
			guideCordisExplanation: [
				"### 可以创造什么",
				"创造模式具备标准任务工具，并增加运行时检查、持久化插件管理，以及 Cordis 插件和 Agent 预设的开发指引。可以编写插件来添加功能或界面，也可以组合工具和提示词，创建适合特定任务的模式。",
				"### 插件与模式的关系",
				"插件为 DSH 增加能力，例如工具、服务连接或界面入口。模式是一份 Agent 预设，用来选择任务可用的工具，并约定 Agent 的工作方式。自定义模式中也可以使用自己开发的插件。",
				"### 怎样让成果生效",
				"可以要求 Agent 完成安装并验证实际效果。插件可能即时加载，也可能需要重启，取决于修改内容；新建的模式在创建新任务时选择。"
			].join("\n\n"),
			guideCordisUsage: [
				"### 添加一个界面",
				"> 帮我写一个 DSH 插件，在侧栏增加「项目笔记」入口，列出当前工作区的 Markdown 文件，点击后能预览内容。完成安装并验证页面能打开。",
				"预期产出：带侧栏入口和预览页的插件，以及仍需完成的生效步骤。",
				"### 添加一个工具",
				"> 写一个插件，提供读取项目测试报告、汇总失败用例的工具。注册工具，并用一份示例报告验证调用结果。",
				"预期产出：可调用的新工具，以及一次示例调用的验证结果。",
				"### 创建自己的模式",
				"> 基于标准模式创建「代码审查」模式，优先检查潜在错误和测试缺口，指出文件与行号，修改文件前先询问我。保存成可选择的预设。",
				"预期产出：可在新任务中选择的自定义模式。审查要求用于指导 Agent，实际可执行的操作仍由权限设置决定。"
			].join("\n\n")
		};
		/** The en dictionary. */
		const en = {
			branch: "Branch",
			localBranches: "Local branches",
			remoteBranches: "Remote branches",
			openMenu: "Show branches",
			switching: "Switching…",
			switchFailed: "Switch failed",
			createBranch: "Create and check out new branch…",
			createBranchPlaceholder: "New branch name",
			createBranchConfirm: "Create",
			createBranchFailed: "Create branch failed",
			switchDirtyTitle: "Uncommitted changes",
			switchDirtyIntro: "This workspace has uncommitted changes. Switching to \"{branch}\" may fail or carry them along.",
			switchDirtyUntracked: "new",
			switchDirtyMore: "…and {n} more",
			switchDirtyCancel: "Keep my changes",
			switchDirtyConfirm: "Switch anyway",
			cancel: "Cancel",
			detached: "Detached HEAD",
			loading: "Loading…",
			noBranches: "No branches",
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
			gitGraphFilter: "Filter",
			gitGraphFilterBranches: "Branch",
			gitGraphFilterLocal: "Local branches",
			gitGraphFilterRemote: "Remote branches",
			gitGraphFilterTags: "Tags",
			gitGraphFilterAuthors: "Author",
			gitGraphFilterAllAuthors: "All authors",
			gitGraphFilterClear: "Clear filter",
			gitGraphFilterEmpty: "Nothing to filter by yet",
			gitGraphFilterNone: "All branches",
			gitGraphFilterActive: "{n} filter(s) active",
			gitGraphFilterShown: "{shown} / {total} commits",
			gitGraphFilterNoMatches: "No commits match the current filter",
			close: "Close",
			agentPreset: "Agent preset",
			agentPresetHint: "Agent preset for this session",
			seatHint: "Choose the agent preset for your new task",
			lockedHint: "This session already started with a preset and cannot change it",
			noDescription: "No description.",
			selectedTag: "Selected",
			switchRefused: "Could not switch to {name}: {reason}",
			enhanceTitle: "Rewrite this prompt with the model",
			enhanceBusy: "Enhancing…",
			enhanceEmpty: "Nothing to enhance — the composer is empty.",
			enhanceTooLarge: "This draft is too long to enhance.",
			enhanceNoSession: "This session is no longer open.",
			enhanceNoModel: "This session has no model selected.",
			enhanceNoService: "This deployment has no model service available.",
			enhanceTimeout: "The model took too long to respond. Try again.",
			enhanceTruncated: "The rewrite was cut off, so the composer was left unchanged.",
			enhanceEmptyResult: "The model returned nothing usable.",
			enhanceModelError: "The model call failed. Try again.",
			enhanceNetwork: "Could not reach the enhance service. Check your connection and try again.",
			enhanceFailed: "Could not enhance the prompt; the composer was left unchanged.",
			presetStandardName: "Standard mode",
			presetStandardDescription: "Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed.",
			presetPtcName: "PTC mode",
			presetPtcDescription: "Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results.",
			presetMinimalName: "Minimal mode",
			presetMinimalDescription: "The agent works using only a terminal tool. Useful for testing and comparing its basic performance.",
			presetCordisName: "Creator mode",
			presetCordisDescription: "Customize DSH through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.",
			modeExplanation: "Mode details",
			howToUse: "How to use",
			guideSections: "Guide sections",
			guideCopy: "Copy",
			guideCopied: "Copied",
			guideFootnotes: "Footnotes",
			codeBlockTitle: "Code",
			codeBlockWrap: "Wrap",
			codeBlockUnwrap: "Unwrap",
			guideStandardIntro: "Choose Standard mode when starting a new task. Describe what you want to accomplish, point to the relevant files, and explain how to check the result.",
			guideStandardExplanation: [
				"### How it works",
				"The agent calls tools directly to read and edit files, search, and run terminal commands. It includes Skills, planning, goals, subagents, workflows, and context compaction.",
				"### When to choose it",
				"Start here for everyday coding, file work, and research. Standard mode can also write scripts and process files in batches. PTC changes how tool calls are organized; it is not required for batch tasks."
			].join("\n\n"),
			guideStandardUsage: [
				"### Fix a bug",
				"> Find out why submitting the search form twice makes the results disappear. Fix it and run the relevant tests. Explain the cause and what changed.",
				"Expected output: a code change, the relevant test results, and an explanation of the cause.",
				"### Organize project notes",
				"> Read the Markdown notes in this project. Summarize the agreed decisions and open questions, with links to the source files.",
				"Expected output: a summary with references that you can check against the original notes."
			].join("\n\n"),
			guidePtcIntro: "Choose PTC mode when starting a new task. Specify the input files, processing rules, and output format. The agent writes the code.",
			guidePtcExplanation: [
				"### How tools are called",
				"PTC means Programmatic Tool Calling. In this built-in preset, the agent uses run_code to write a TypeScript program that calls tools through a generated SDK. The program can use loops, conditions, error handling, and concurrent calls where appropriate.",
				"### What reaches the model",
				"Tool results first reach the program, which can filter and combine them. The model receives what the program prints or returns; image results are attached separately. Nested tool calls are still recorded and remain subject to tool permissions.",
				"### Compared with Standard mode",
				"Both modes can handle coding and batch tasks. Standard mode exposes individual tools directly; PTC organizes tool calls in code. The current PTC preset leaves the workflow tool disabled. Speed and token use depend on the task and how the program handles its results."
			].join("\n\n"),
			guidePtcUsage: [
				"### Check a set of configuration files",
				"> Check all JSON files in configs/. List missing required fields and invalid values against schema.json. Save a CSV with one row per issue. Include unreadable files in the report and keep checking the rest. Leave the original files unchanged.",
				"Expected output: an issue summary and a CSV report. The program can repeat the same checks, handle individual failures, and collect the results.",
				"### Summarize error logs",
				"> Analyze the log files in logs/. Group errors by service and error type. Show the ten most frequent groups and one example from each. Save the full counts to a CSV.",
				"Expected output: the top error groups and a complete count table. Intermediate data can be aggregated in the program before the summary reaches the model."
			].join("\n\n"),
			guideMinimalIntro: "Choose Minimal mode for a new task. For a comparison, hold the model, permissions, input, and starting workspace state constant across runs.",
			guideMinimalExplanation: [
				"### What is included",
				"One persistent shell tool and a fixed system prompt. The built-in preset does not load Skills, planning, context compaction, or the standard runtime context.",
				"### When to choose it",
				"Use it as a baseline for experiments and comparisons. It can still read files and execute scripts through shell commands, but offers fewer built-in ways to manage a long task. Fewer tools does not necessarily make it easier for a beginner."
			].join("\n\n"),
			guideMinimalUsage: [
				"### Compare performance on a small bug fix",
				"> Run the tests for this project, find the cause of the failure, and make the smallest fix. Run the relevant tests again and report the result.",
				"Run the same task separately in Standard and Minimal modes from the same starting state. Compare task completion, tool calls, and the resulting changes. Minimal mode performs the work through terminal commands."
			].join("\n\n"),
			guideCordisIntro: "Choose Creator mode for a new task. Describe the capability you want, where it should appear, and how you will verify it.",
			guideCordisExplanation: [
				"### What you can create",
				"Creator mode includes the standard task tools plus runtime inspection, persistent plugin management, and guidance for authoring Cordis plugins and agent presets. It can create a plugin that adds a capability or UI, or a preset that combines tools and prompts for a particular job.",
				"### Plugins and modes",
				"A plugin adds capabilities to DSH, such as a tool, a service connection, or a UI entry. A mode is an agent preset that selects tools and defines how the agent works in a task. A plugin can be included in a custom preset.",
				"### How the result takes effect",
				"Ask the agent to install and verify the result, not just generate source code. A plugin may load immediately or require a restart, depending on what it changes. A newly created preset is selected when starting a new task."
			].join("\n\n"),
			guideCordisUsage: [
				"### Add a UI",
				"> Create a DSH plugin that adds a project notes entry to the sidebar. Let me browse the Markdown files in this workspace and preview a selected note. Install it and verify that the page opens.",
				"Expected output: an installed plugin with a working entry and preview page, plus any remaining activation steps.",
				"### Add a tool",
				"> Create a plugin with a tool that reads this project's test report and summarizes the failed tests. Register it and verify it with a sample report.",
				"Expected output: a plugin with a callable tool and a verified sample call.",
				"### Create my own mode",
				"> Create a \"Code review\" mode based on Standard mode. Have it prioritize potential bugs and test gaps, cite file paths and lines, and ask before modifying files. Save it as a selectable preset.",
				"Expected output: a custom preset for new tasks. These review instructions guide the agent; permission settings determine which actions it can execute."
			].join("\n\n")
		};
		//#endregion
		//#region src/client/index.tsx
		/**
		* Services required before mounting (all provided by the client runtime).
		*
		* `remote` is deliberately NOT here: the preset seats are an addition that a
		* deployment without the agent-preset registry simply does not get, and a hard
		* dependency would fail the whole activation — taking the branch pill and Git
		* Graph down with it — rather than omitting two controls.
		*/
		const inject = [
			"slots",
			"sessions",
			"locale"
		];
		/** The slot the BRANCH pill occupies: the composer's left tool cluster, after the mode selector. */
		const INPUT_SLOT = "conversation.input.left";
		const VIEW_SLOT = "conversation.view";
		/**
		* The seat the prompt ENHANCER occupies: the compact-control run immediately
		* left of the model selector, in the composer's TRAILING cluster.
		*
		* ## Why not `input.left`
		*
		* `ui-conversation` splits the tool row into two containers:
		*
		*   [ leading  ]  + · permission · plan · input.left
		*   [ trailing ]  input.right · input.model · submit
		*
		* So `input.left` and `input.model` sit in DIFFERENT containers — a higher
		* `order` in `input.left` only makes an occupant the rightmost of the leading
		* cluster, not adjacent to the model picker. "Next to the model selector"
		* requires the trailing cluster, i.e. this seat.
		*
		* The runtime's own slot contract names it "Compact controls before the
		* composer submit action", `kind: 'list'`, `scope: 'session'`, with
		* `occupants: []` and `replaceRisk: 'none'` as of rev `d5562dc82e23` — nothing
		* registers there, so a `list` seat is used and no `priority: -1` shadowing of
		* a foreign control is needed (contrast `input.model`, a `single` seat the
		* official picker holds at priority 0).
		*/
		const ENHANCE_SLOT = "conversation.input.right";
		/**
		* The hero row's agent-preset seat, declared by ui-conversation as `single` and
		* rendered directly after `conversation.hero.workspace` (选择工作区).
		*/
		const HERO_PRESET_SLOT = "conversation.hero.agentPreset";
		/** The session header's action list, where the read-only preset label goes. */
		const HEADER_ACTION_SLOT = "conversation.session.header.actions";
		/** The header seat's preset label id. */
		const HEADER_LABEL_ID = "workspace-git-agent-preset";
		/**
		* Locate the Developer-tools setting, if this deployment mounts it.
		*
		* Probed structurally rather than through a hard `inject` entry: the setting is
		* owned by the settings UI, and a deployment without it must still get the
		* preset chip (in that case nothing gates the official chip either, so the
		* honest default is "not enabled" — meaning we do NOT defer).
		*
		* @param ctx - the client plugin context.
		* @returns the snapshot source, or undefined when the setting is absent.
		*/
		function detectDeveloperTools(ctx) {
			return (ctx.get("configForms") ?? void 0)?.developerTools?.enabled;
		}
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
			ctx.effect(() => ctx.slots.inject(ENHANCE_SLOT, () => ctx.slots.register({
				name: ENHANCE_SLOT,
				id: "workspace-git-prompt-enhance",
				locale: LOCALE_NS,
				registrant: "dsh-workspace-git",
				inject: (sessionId) => ({ sessionId })
			}, PromptEnhancer)), "dsh-workspace-git: composer prompt enhancer");
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
			ctx.inject(["remote", "remote.agentPresets"], (rawScope) => {
				const scope = rawScope;
				const presetStore = new AgentPresetStore(scope.get("remote"));
				scope.effect(() => () => presetStore.dispose(), "dsh-workspace-git: agent preset store");
				const developerToolsEnabled = detectDeveloperTools(scope);
				scope.effect(() => scope.slots.inject(HERO_PRESET_SLOT, () => scope.slots.register({
					name: HERO_PRESET_SLOT,
					priority: -1,
					locale: LOCALE_NS,
					registrant: "dsh-workspace-git",
					inject: () => ({ store: presetStore })
				}, AgentPresetChip)), "dsh-workspace-git: agent preset chip");
				ctx.effect(() => scope.slots.inject(HEADER_ACTION_SLOT, () => scope.slots.register({
					name: HEADER_ACTION_SLOT,
					id: HEADER_LABEL_ID,
					order: -10,
					locale: LOCALE_NS,
					registrant: "dsh-workspace-git",
					inject: () => ({
						store: presetStore,
						developerTools: developerToolsEnabled
					})
				}, AgentPresetLabel)), "dsh-workspace-git: agent preset header label");
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map