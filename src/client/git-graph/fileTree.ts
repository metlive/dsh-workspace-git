/**
 * Build a nested file tree from flat git path strings (repo-relative).
 */

export interface FileTreeNode {
  name: string
  /** Full path from repo root for files; directory path for folders. */
  path: string
  kind: 'file' | 'dir'
  children: FileTreeNode[]
  /** Recursive file count under this node (file nodes = 1). */
  fileCount: number
}

function sortNodes(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) {
    if (node.kind === 'dir') sortNodes(node.children)
  }
}

function recount(node: FileTreeNode): number {
  if (node.kind === 'file') {
    node.fileCount = 1
    return 1
  }
  let total = 0
  for (const child of node.children) total += recount(child)
  node.fileCount = total
  return total
}

/**
 * @param files - relative paths from `git diff-tree --name-only`.
 * @returns sorted root children of the tree.
 */
export function buildFileTree(files: readonly string[]): FileTreeNode[] {
  const root: FileTreeNode = {
    name: '',
    path: '',
    kind: 'dir',
    children: [],
    fileCount: 0,
  }

  for (const raw of files) {
    const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '').trim()
    if (normalized === '') continue
    const parts = normalized.split('/').filter(Boolean)
    let current = root
    let prefix = ''
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!
      prefix = prefix === '' ? part : `${prefix}/${part}`
      const isFile = i === parts.length - 1
      let next = current.children.find(child => child.name === part)
      if (next === undefined) {
        next = {
          name: part,
          path: prefix,
          kind: isFile ? 'file' : 'dir',
          children: [],
          fileCount: 0,
        }
        current.children.push(next)
      } else if (isFile) {
        next.kind = 'file'
      } else if (next.kind === 'file') {
        // A path segment that was a file earlier is treated as a directory when
        // deeper children appear (unusual but keep the tree usable).
        next.kind = 'dir'
      }
      current = next
    }
  }

  sortNodes(root.children)
  for (const child of root.children) recount(child)
  return root.children
}
