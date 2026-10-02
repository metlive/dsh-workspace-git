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
import { type ReactNode } from 'react';
import type { BranchStore } from './store.ts';
/** The session list snapshot face this component reads through `useSessions`. */
interface SessionListLike {
    byId: Record<string, {
        cwd?: string;
    } | undefined>;
}
/** Props the composer's input seat composes for this selector. */
export interface BranchSelectProps {
    /** The session this seat occurrence draws. */
    sessionId?: string;
    /** The client session list selector hook supplied by the seat. */
    useSessions?: <T>(selector: (state: SessionListLike) => T) => T;
    /** Namespace-bound translator supplied by the seat. */
    t?: (key: string) => string;
    /** The plugin's branch store (supplied through the seat's inject factory). */
    store?: BranchStore;
}
/**
 * The selector. Renders null when the workspace has no branch.
 * @param props - the composed slot props.
 * @returns the trigger and its menu, or null.
 */
export declare function BranchSelect({ sessionId, useSessions, t, store }: BranchSelectProps): ReactNode;
export {};
