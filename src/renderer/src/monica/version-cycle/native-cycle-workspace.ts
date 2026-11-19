import type { Worktree } from '../../../../shared/worktree/types'
import type { CycleScope } from './ports'
import { findVersionFlowWorktrees } from '../../../../shared/monica/version-workspace-match'
import {
  nativeWorkspaceScope,
  nativeWorkspaceScopeKey,
  type NativeWorkspaceScope
} from './native-workspace'
export { nativeWorkspaceRuntimeTarget as cycleRuntimeTarget } from './native-workspace'

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

/** Overview draft facts are only valid for one bound tree on its own registration. */
export function overviewWorkflowTrees(
  scope: NativeWorkspaceScope | null,
  worktrees: readonly Worktree[],
  version: string | null
) {
  let error: string | null = null
  const resolve = (workflow: CycleScope['workflow']) => {
    if (!scope || !version) {
      return null
    }
    const candidates = findVersionFlowWorktrees(worktrees, { version, workflow }).filter((tree) => {
      try {
        return (
          nativeWorkspaceScopeKey(nativeWorkspaceScope(tree)) === nativeWorkspaceScopeKey(scope)
        )
      } catch {
        return false
      }
    })
    if (candidates.length > 1) {
      error = '有多个流程工作区，请从版本侧栏选择具体工作区。'
    }
    return candidates.length === 1 ? candidates[0].id : null
  }
  return { plan: resolve('plan'), acceptance: resolve('acceptance'), error }
}
