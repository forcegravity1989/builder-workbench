import type { Worktree } from '../../../../shared/worktree/types'
import type { CycleScope } from './ports'
import { ensureNamedWorktree, findNamedWorktree, nativeWorkspaceScope } from './native-workspace'
export { nativeWorkspaceRuntimeTarget as cycleRuntimeTarget } from './native-workspace'

export const cycleBranch = (scope: Pick<CycleScope, 'workflow'>) =>
  scope.workflow === 'plan' ? 'bw/week-plan' : 'bw/week-acceptance'
export const cycleScopeKey = (scope: CycleScope) =>
  JSON.stringify([
    scope.projectId,
    scope.repoId,
    scope.hostId,
    scope.runtimeOwnerEnvironmentId ?? '',
    scope.workflow
  ])
export const cycleScopeForWorktree = (
  worktree: Worktree,
  workflow: CycleScope['workflow']
): CycleScope => ({ ...nativeWorkspaceScope(worktree), workflow })
export const findCycleWorktree = (scope: CycleScope) => findNamedWorktree(scope, cycleBranch(scope))
export const ensureCycleWorktree = (scope: CycleScope) =>
  ensureNamedWorktree(
    scope,
    cycleBranch(scope),
    scope.workflow === 'plan' ? 'week-plan' : 'week-acceptance'
  )
