import type {
  MilestoneRead,
  MilestoneSave,
  MilestoneSubmitResult,
  MilestoneWorkingFile
} from '../../../shared/monica/project-milestones'
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
export const readMilestones = (scope: MilestoneScope) =>
  callMetricRuntime<MilestoneRead>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.read',
    (owner) => ({ scope: owner, includeProject: true }),
    60_000
  )
const loadFormalMilestones = async (scope: MilestoneScope) => {
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
export async function readFormalMilestones(scope: MilestoneScope, force = true) {
  const key = milestoneSourceKey(scope)
  await milestoneSourceCache.read(key, () => loadFormalMilestones(scope), force)
  const result = milestoneSourceCache.get(key)
  if (result.error) {
    throw new Error(result.error)
  }
  if (!result.value) {
    throw new Error('项目规划尚未读回')
  }
  return result.value
}
export const readMilestoneWorking = (scope: MilestoneScope) =>
  callMetricRuntime<MilestoneWorkingFile>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.working',
    (owner) => ({ scope: owner }),
    30_000
  )
export const saveMilestoneWorking = (
  scope: MilestoneScope,
  request: Omit<MilestoneSave, 'scope'>
) =>
  callMetricRuntime<MilestoneWorkingFile>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.save',
    (owner) => ({ ...request, scope: owner }),
    90_000
  )
export const discardMilestoneWorking = (scope: MilestoneScope, expectedRevision: string | null) =>
  callMetricRuntime<MilestoneWorkingFile>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.discard',
    (owner) => ({ expectedRevision, scope: owner }),
    90_000
  )
export const submitMilestones = (scope: MilestoneScope, expectedRevision: string) =>
  callMetricRuntime<MilestoneSubmitResult>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.submit',
    (owner) => ({ expectedRevision, scope: owner }),
    300_000
  )
