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
import { type ReactNode } from 'react';
export interface GitGraphDetailPanelProps {
    cwd: string;
    hash: string;
    onClose: () => void;
    /**
     * Rail width CSS. Defaults match ui-trajectory's `.details`:
     * `clamp(320px, 38%, 440px)` bounded by `calc(100% - 280px)` so the commit
     * list always keeps a usable minimum. `narrowWidth` is applied by the split's
     * container query under ~900px of SPLIT width (not viewport width).
     */
    width?: string;
    maxWidth?: string;
    narrowWidth?: string;
    labels: {
        loading: string;
        error: string;
        close: string;
        commitInfo: string;
        author: string;
        time: string;
        branches: string;
        files: string;
        filesCount: (n: number) => string;
        inBranches: (n: number) => string;
        /**
         * Chrome for the Markdown body renderer: the copy button on fenced code
         * blocks and the footnote section heading. Supplied by the caller (which
         * owns the translator) so this file stays free of locale plumbing.
         */
        markdown: {
            copy: string;
            copied: string;
            code: string;
            wrap: string;
            unwrap: string;
            footnotes: string;
        };
    };
}
/**
 * Detail panel for one selected commit.
 */
export declare function GitGraphDetailPanel({ cwd, hash, onClose, width, maxWidth, narrowWidth, labels, }: GitGraphDetailPanelProps): ReactNode;
