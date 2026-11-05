import { useEffect, useRef } from 'react'
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import {
  getProjectIdentityKey,
  isHostLocalProjectId
} from '../../../shared/project-host-setup-projection'
import { useAppStore } from '@/store'

type CrossHostRefreshModel = {
  taskSource: string
  selectedRepos: readonly Repo[]
  repos: readonly Repo[]
}

/**
 * 任务屏进屏刷新（#512）：把「同一项目、在其他已连接主机上」的工作树拉回本实例
 * 渲染端登记集合。任务屏行只读本实例的 allWorktrees，而别人的工作树登记在各
 * 自执行宿主上；侧栏本来就按宿主汇总，这里只是让任务屏进屏时补一次同样的读取。
 *
 * 只做 best-effort：项目身份必须是跨主机可证明的（`repo:<id>` 这类 host-local
 * 身份跳过），失败静默——主机离线即视为无可读状态，行保持 Start。
 */
export function useTaskPageCrossHostRefresh<T extends CrossHostRefreshModel>(model: T): T {
  const requestedRef = useRef(new Set<string>())
  const { taskSource, selectedRepos, repos } = model
  useEffect(() => {
    if (taskSource !== 'github' && taskSource !== 'codehub') {
      return
    }
    const fetchWorktrees = useAppStore.getState().fetchWorktrees
    const siblings = new Map<string, Repo>()
    for (const selected of selectedRepos) {
      const projectId = getProjectIdentityKey(selected)
      if (isHostLocalProjectId(projectId)) {
        continue
      }
      const selectedHostId = getRepoExecutionHostId(selected)
      for (const repo of repos) {
        const hostId = getRepoExecutionHostId(repo)
        if (repo.id === selected.id && hostId === selectedHostId) {
          continue
        }
        if (getProjectIdentityKey(repo) !== projectId) {
          continue
        }
        siblings.set(`${repo.id}::${hostId}`, repo)
      }
    }
    for (const [key, repo] of siblings) {
      if (requestedRef.current.has(key)) {
        continue
      }
      requestedRef.current.add(key)
      // 主机未连/离线时 fetchWorktrees 返回 false；释放登记，主机就绪后的下一次
      // 重渲染或再进屏还能补读，不把「这次没读到」固化成整个会话的 Start。
      void fetchWorktrees(repo.id, { executionHostId: getRepoExecutionHostId(repo) }).then(
        (authoritative) => {
          if (!authoritative) {
            requestedRef.current.delete(key)
          }
        }
      )
    }
  }, [repos, selectedRepos, taskSource])
  return model
}
