/**
 * Commit-graph wire types shared by the host parser and the client layout.
 * Shaped after ZCode's GitCommitGraph* types so the layout algorithm ports
 * without structural changes.
 */

/** What kind of ref a decoration names. */
export type GitGraphRefKind = 'branch' | 'remote' | 'tag' | 'head'

/** One ref decoration attached to a commit. */
export interface GitGraphRef {
  name: string
  kind: GitGraphRefKind
}

/** One commit row of the graph. */
export interface GitGraphCommit {
  hash: string
  parents: string[]
  refs: GitGraphRef[]
  subject: string
  authorName: string | null
  authoredAtMs: number | null
}

/** Result of one graph page fetch. */
export interface GitGraphResult {
  commits: GitGraphCommit[]
  hasMore: boolean
}

/** One commit's detail for the right-hand panel. */
export interface GitCommitDetail {
  hash: string
  subject: string
  body: string
  authorName: string | null
  authorEmail: string | null
  authoredAtMs: number | null
  refs: string[]
  files: string[]
}
