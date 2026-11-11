import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { getWorktreeVisitTimestamp } from '@/lib/worktree-visit-recency'
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { worktreeMatchesHost } from '@/store/slices/worktrees/listing/worktree-host-ownership'
import { closeProjectPage } from './project-page-state'

export async function continueProjectWork(repo: Repo): Promise<void> {
  const hostId = getRepoExecutionHostId(repo)
  const refreshed = await useAppStore
    .getState()
    .fetchWorktrees(repo.id, { executionHostId: hostId, requireAuthoritative: true })
  if (!refreshed) {
    throw new Error('项目所在主机暂不可用，请恢复连接后重试')
  }
  const state = useAppStore.getState()
  const trees = (state.worktreesByRepo[repo.id] ?? []).filter(
    (tree) => !tree.isArchived && worktreeMatchesHost(tree, hostId)
  )
  const latest = [...trees].sort(
    (a, b) =>
      (getWorktreeVisitTimestamp(state.lastVisitedAtByWorktreeId, b) ?? 0) -
      (getWorktreeVisitTimestamp(state.lastVisitedAtByWorktreeId, a) ?? 0)
  )
  const visited = latest.find((tree) =>
    getWorktreeVisitTimestamp(state.lastVisitedAtByWorktreeId, tree)
  )
  const tree = visited ?? trees.find((item) => item.isMainWorktree) ?? trees[0]
  if (!tree) {
    throw new Error('未找到工作区，请从原生项目菜单新建工作区')
  }
  const result = activateAndRevealWorktree(tree.id, { executionHostId: hostId })
  if (!result) {
    throw new Error('工作区未能打开，请核对原生工作区列表')
  }
  closeProjectPage()
}
