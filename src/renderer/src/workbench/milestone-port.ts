import type {
  MilestoneRead,
  MilestoneSubmit,
  MilestoneSubmitResult
} from '../../../shared/workbench/project-milestones'
import { callMetricRuntime } from './metric-runtime-rpc'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'

export type MilestoneScope = NativeWorkspaceScope & { worktreeId: string }
const wireScope = (scope: MilestoneScope) => ({
  repoId: scope.repoId,
  worktreeId: scope.worktreeId,
  hostId: scope.hostId
})
export const readMilestones = (scope: MilestoneScope) =>
  callMetricRuntime<MilestoneRead>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.read',
    (owner) => ({ scope: owner }),
    60_000
  )
export const submitMilestones = (scope: MilestoneScope, request: Omit<MilestoneSubmit, 'scope'>) =>
  callMetricRuntime<MilestoneSubmitResult>(
    wireScope(scope),
    scope.runtimeOwnerEnvironmentId,
    'workbench.milestones.submit',
    (owner) => ({ ...request, scope: owner }),
    300_000
  )
