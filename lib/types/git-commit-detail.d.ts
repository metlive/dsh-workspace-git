export interface GitCommitDetail {
    hash: string;
    subject: string;
    body: string;
    authorName: string | null;
    authorEmail: string | null;
    authoredAtMs: number | null;
    /** Decoration from `%D` (branches / tags / HEAD), split and trimmed. */
    refs: string[];
    /** Changed file paths relative to the work tree root. */
    files: string[];
}
/**
 * @param hash - full commit object id.
 * @throws WorkspaceGitError when the hash is not a safe object id.
 */
export declare function assertSafeCommitHash(hash: string): void;
/**
 * Load one commit's metadata and changed file list.
 * @param path - absolute workspace path.
 * @param hash - full commit hash.
 */
export declare function fetchCommitDetail(path: string, hash: string): Promise<GitCommitDetail>;
