import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import {
  getProjectIdentityKey,
  isHostLocalProjectId
} from '../../../shared/project-host-setup-projection'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'

/**
 * 跨主机 Issue 工作树候选（#512 任务屏）：同一项目注册在多台已连接主机时，
 * 别人在某台主机建好的 Issue 工作树也要让本实例的任务屏显示 Open。
 *
 * 归属只认两样可证明的事实，不从分支名、目录名或标题推断：
 * - 原生 linked 字段带出 Issue（GitHub linkedIssue / linkedWorkItem，CodeHub linkedWorkItem）；
 * - 工作树所属仓库与本行仓库是同一项目稳定身份（getProjectIdentityKey），或工作树
 *   记录的创建来源 projectId 相同。
 *
 * host-local 身份（`repo:<id>`，无 remote 的项目）跨主机不可证明，直接放弃匹配。
 */
export function findCrossHostIssueWorktrees(args: {
  worktrees: readonly Worktree[]
  repos: readonly Repo[]
  provider: 'github' | 'codehub'
  issue: { repoId?: string | null; number: number }
  versionScope: { version: string } | null
}): Worktree[] {
  const { worktrees, repos, provider, issue, versionScope } = args
  const queryRepo = issue.repoId ? repos.find((repo) => repo.id === issue.repoId) : undefined
  if (!queryRepo) {
    return []
  }
  const projectId = getProjectIdentityKey(queryRepo)
  if (isHostLocalProjectId(projectId)) {
    return []
  }
  const linked = worktrees.filter(
    (worktree) => !worktree.isArchived && workspaceLinksIssue(worktree, provider, issue.number)
  )
  if (linked.length === 0) {
    return []
  }
  const siblingRepoIds = new Set(
    repos.filter((repo) => getProjectIdentityKey(repo) === projectId).map((repo) => repo.id)
  )
  const matches = linked.filter(
    (worktree) =>
      sameProject(worktree, provider, projectId, siblingRepoIds) &&
      versionMatches(worktree, versionScope, provider)
  )
  return matches.sort((left, right) => left.id.localeCompare(right.id))
}

function workspaceLinksIssue(
  worktree: Worktree,
  provider: 'github' | 'codehub',
  number: number
): boolean {
  const linkedWorkItem = worktree.linkedWorkItem
  if (
    linkedWorkItem?.provider === provider &&
    linkedWorkItem.type === 'issue' &&
    linkedWorkItem.number === number
  ) {
    return true
  }
  return provider === 'github' && worktree.linkedIssue === number
}

function sameProject(
  worktree: Worktree,
  provider: 'github' | 'codehub',
  projectId: string,
  siblingRepoIds: ReadonlySet<string>
): boolean {
  if (siblingRepoIds.has(worktree.repoId)) {
    return true
  }
  const source = worktree.linkedTaskSourceContext
  return source?.provider === provider && source.projectId === projectId
}

function versionMatches(
  worktree: Worktree,
  versionScope: { version: string } | null,
  provider: 'github' | 'codehub'
): boolean {
  if (!versionScope) {
    return true
  }
  // 与 findVersionTaskWorktrees 同一绑定口径：版本相同还不够，绑定来源必须同 provider，
  // 否则同号 Issue 的跨来源改绑会开出另一个任务来源的树。
  const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
  return (
    binding?.workflow === 'issue' &&
    binding.version === versionScope.version &&
    binding.taskSource?.provider === provider
  )
}
