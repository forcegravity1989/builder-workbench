import type {
  MilestoneRead,
  MilestoneSubmit,
  MilestoneSubmitResult
} from '../../../shared/workbench/project-milestones'
import { callMetricRuntime } from './metric-runtime-rpc'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { createOverviewReadCache } from './version-overview/overview-read-cache'

export type MilestoneScope = NativeWorkspaceScope & { worktreeId: string }
const wireScope = (scope: MilestoneScope) => ({
  repoId: scope.repoId,
  worktreeId: scope.worktreeId,
  hostId: scope.hostId
})
export const milestoneSourceKey = (scope: MilestoneScope) =>
  JSON.stringify([scope.repoId, scope.worktreeId, scope.hostId, scope.runtimeOwnerEnvironmentId])
export const milestoneSourceCache = createOverviewReadCache<MilestoneRead>((next) => next)
const loadMilestones = async (scope: MilestoneScope) => {
  const result = await callMetricRuntime<MilestoneRead>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.read',
    (owner) => ({ scope: owner }),
    60_000
  )
  if (result.formal.problems.length) {
    throw new Error(`正式里程碑未完整读回：${result.formal.problems.join('；')}`)
  }
  return result
}
export async function readMilestones(scope: MilestoneScope, force = true) {
  const key = milestoneSourceKey(scope)
  await milestoneSourceCache.read(key, () => loadMilestones(scope), force)
  const result = milestoneSourceCache.get(key)
  if (result.error) {
    throw new Error(result.error)
  }
  if (!result.value) {
    throw new Error('项目规划尚未读回')
  }
  return result.value
}
export const submitMilestones = (scope: MilestoneScope, request: Omit<MilestoneSubmit, 'scope'>) =>
  callMetricRuntime<MilestoneSubmitResult>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.submit',
    (owner) => ({ ...request, scope: owner }),
    300_000
  )
