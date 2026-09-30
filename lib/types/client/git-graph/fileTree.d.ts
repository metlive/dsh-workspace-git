/**
 * Build a nested file tree from flat git path strings (repo-relative).
 */
export interface FileTreeNode {
    name: string;
    /** Full path from repo root for files; directory path for folders. */
    path: string;
    kind: 'file' | 'dir';
    children: FileTreeNode[];
    /** Recursive file count under this node (file nodes = 1). */
    fileCount: number;
}
/**
 * @param files - relative paths from `git diff-tree --name-only`.
 * @returns sorted root children of the tree.
 */
export declare function buildFileTree(files: readonly string[]): FileTreeNode[];
