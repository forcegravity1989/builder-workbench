import type { Repo } from '../../../../shared/repo-types'
import { LOCAL_EXECUTION_HOST_ID, getRepoExecutionHostId } from '../../../../shared/execution-host'
import {
  getDefaultTaskRepoSelection,
  getTaskEligibleRepos,
  getTaskRepoProjectKey
} from '@/components/task-page-default-repo-selection'

/**
 * #542：项目墙按项目身份归组，但任务入口跟随的是具体仓库副本。点击其他设备的
 * 工作区会把当前副本换成对方宿主的那一份；同项目存在本机副本时，入口应回到本机
 * 副本，保持「跟随项目」而不是「跟随被点击的副本/宿主」。本机没有该项目副本时
 * 保持当前副本，避免跨宿主乱跳。
 */
export function resolveTaskEntryRepoId(
  activeRepoId: string | null,
  repos: readonly Repo[]
): string | null {
  const current = activeRepoId ? repos.find((repo) => repo.id === activeRepoId) : null
  if (!current) {
    return null
  }
  const eligible = getTaskEligibleRepos(repos)
  const currentEligible = eligible.some((repo) => repo.id === current.id)
  if (currentEligible && getRepoExecutionHostId(current) === LOCAL_EXECUTION_HOST_ID) {
    return current.id
  }
  const projectKey = getTaskRepoProjectKey(current)
  const sameProject = eligible.filter((repo) => getTaskRepoProjectKey(repo) === projectKey)
  // Reuse the native default-selection comparator: local copy first, then registration order.
  const preferred = [...getDefaultTaskRepoSelection(sameProject)][0] ?? null
  const preferredRepo = preferred ? sameProject.find((repo) => repo.id === preferred) : null
  if (preferredRepo && getRepoExecutionHostId(preferredRepo) === LOCAL_EXECUTION_HOST_ID) {
    return preferredRepo.id
  }
  return currentEligible ? current.id : null
}
