/**
 * Selectors the test drives against a rendered DOM shape. Exported so a sheet
 * that matches nothing FAILS LOUDLY instead of silently rendering at the
 * Markdown default — the exact failure this file has already shipped once.
 */
export declare const COMMIT_BODY_SELECTOR_PROBES: readonly ["[data-workspace-git-commit-body]", "[data-workspace-git-commit-body] > *", "[data-workspace-git-commit-body] *", "[data-workspace-git-commit-body] :where(h1, h2, h3, h4, h5, h6)", "[data-workspace-git-commit-body] :where(code, pre, kbd, samp, table, th, td, .katex)"];
/**
 * Inject (or refresh) the commit-body stylesheet.
 *
 * Idempotent and safe to call on every mount: an existing tag is rewritten in
 * place rather than appended, so an HMR re-activation does not accumulate
 * duplicate `<style>` nodes.
 */
export declare function ensureCommitBodyStyles(): void;
