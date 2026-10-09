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
const STYLE_ID = 'workspace-git-commit-body-css'

/** Scope prefix: the attribute on the wrapper we render around `<MarkdownText>`. */
const S = '[data-workspace-git-commit-body]'

const CSS = `
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
`

/**
 * Selectors the test drives against a rendered DOM shape. Exported so a sheet
 * that matches nothing FAILS LOUDLY instead of silently rendering at the
 * Markdown default — the exact failure this file has already shipped once.
 */
export const COMMIT_BODY_SELECTOR_PROBES = [
  `${S}`,
  `${S} > *`,
  `${S} *`,
  `${S} :where(h1, h2, h3, h4, h5, h6)`,
  `${S} :where(code, pre, kbd, samp, table, th, td, .katex)`,
] as const

/**
 * Inject (or refresh) the commit-body stylesheet.
 *
 * Idempotent and safe to call on every mount: an existing tag is rewritten in
 * place rather than appended, so an HMR re-activation does not accumulate
 * duplicate `<style>` nodes.
 */
export function ensureCommitBodyStyles(): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) {
    existing.textContent = CSS
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
