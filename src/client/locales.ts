/**
 * Minimal zh/en copy for the plugin. The client `apply` attaches the locale
 * service (`ctx.locale`, provided by `@deepseek-ai/dsh-client-locale`) and
 * registers these dictionaries under {@link LOCALE_NS}, so the copy follows
 * the Host-backed language preference and switches live. Without an attached
 * service (standalone/test compositions) the browser language decides.
 */

/** The locale namespace this plugin owns. */
export const LOCALE_NS = 'workspaceGit'

/** The zh dictionary. */
export const zh: Record<string, string> = {
  branch: '分支',
  localBranches: '本地分支',
  remoteBranches: '远程分支',
  openMenu: '查看分支列表',
  switchBranch: '切换分支',
  switching: '切换中…',
  switchFailed: '切换失败',
  createBranch: '创建并检查新分支…',
  createBranchPlaceholder: '新分支名称',
  createBranchConfirm: '创建',
  createBranchFailed: '创建分支失败',
  cancel: '取消',
  detached: '游离 HEAD',
  loading: '加载中…',
  noBranches: '没有分支',
  noMatches: '没有匹配的分支',
  searchBranches: '搜索分支',
  gitGraph: 'Git 图谱',
  gitGraphDescription: '本地分支的提交历史',
  gitGraphEmpty: '暂无提交',
  gitGraphError: '加载 Git 图谱失败',
  gitGraphNoRepo: '当前目录不是 Git 仓库',
  gitGraphNoRepoHint: '在此目录初始化仓库后即可查看提交图谱。',
  gitGraphLoadMore: '加载更多',
  gitGraphColumnGraph: '图谱',
  gitGraphColumnDescription: '说明',
  gitGraphColumnDate: '日期',
  gitGraphColumnAuthor: '作者',
  gitGraphColumnCommit: '提交',
  gitGraphSelectCommit: '选择一条提交查看详情',
  gitGraphCommitInfo: '提交信息',
  gitGraphCommitError: '加载提交失败',
  gitGraphBranchInfo: '分支信息',
  gitGraphChangedFiles: '变更文件',
  gitGraphFilesCount: '{n} 个文件',
  gitGraphInBranches: '在 {n} 个引用中:',
  close: '关闭',
}

/** The en dictionary. */
export const en: Record<string, string> = {
  branch: 'Branch',
  localBranches: 'Local branches',
  remoteBranches: 'Remote branches',
  openMenu: 'Show branches',
  switchBranch: 'Switch branch',
  switching: 'Switching…',
  switchFailed: 'Switch failed',
  createBranch: 'Create and check out new branch…',
  createBranchPlaceholder: 'New branch name',
  createBranchConfirm: 'Create',
  createBranchFailed: 'Create branch failed',
  cancel: 'Cancel',
  detached: 'Detached HEAD',
  loading: 'Loading…',
  noBranches: 'No branches',
  noMatches: 'No matching branches',
  searchBranches: 'Search branches',
  gitGraph: 'Git Graph',
  gitGraphDescription: 'Commit history across local branches',
  gitGraphEmpty: 'No commits yet',
  gitGraphError: 'Failed to load Git Graph',
  gitGraphNoRepo: 'This directory is not a Git repository',
  gitGraphNoRepoHint: 'Initialize a repository here to see its commit graph.',
  gitGraphLoadMore: 'Load more',
  gitGraphColumnGraph: 'Graph',
  gitGraphColumnDescription: 'Description',
  gitGraphColumnDate: 'Date',
  gitGraphColumnAuthor: 'Author',
  gitGraphColumnCommit: 'Commit',
  gitGraphSelectCommit: 'Select a commit to inspect',
  gitGraphCommitInfo: 'Commit',
  gitGraphCommitError: 'Failed to load commit',
  gitGraphBranchInfo: 'Branches',
  gitGraphChangedFiles: 'Changed files',
  gitGraphFilesCount: '{n} files',
  gitGraphInBranches: 'In {n} refs:',
  close: 'Close',
}

/** The attached locale service, or undefined when running standalone. */
let attached: { getSnapshot(): { active: string } } | undefined

/**
 * Attach (or detach) the locale service the module-level `t()` resolves
 * through. Called by the client `apply`; passing undefined restores the
 * browser-language fallback.
 * @param service - the locale service face, or undefined.
 */
export function attachLocale(service: { getSnapshot(): { active: string } } | undefined): void {
  attached = service
}

/** Whether the active locale is Chinese. */
export function isZh(): boolean {
  const active = attached?.getSnapshot().active
  if (active !== undefined) return active.startsWith('zh')
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
}

/**
 * Translate one key.
 * @param key - a key of {@link zh} / {@link en}.
 * @returns the copy for the active language, falling back to the key itself.
 */
export function t(key: keyof typeof zh): string {
  const dict = isZh() ? zh : en
  return dict[key] ?? en[key] ?? String(key)
}
