import type { Worktree } from '../../../shared/worktree/types'
import type { VersionWorkflow } from '../../../shared/monica/version-document'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { cycleWorkflowForWorktree } from './monica-nav'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'

export type VersionMaterialSelection = {
  treeKey: string
  workflow: VersionWorkflow
}

export function versionTreeKey(tree: Worktree): string {
  return JSON.stringify([
    tree.repoId,
    tree.hostId ?? tree.identity?.executionHostId ?? null,
    tree.runtimeOwnerEnvironmentId ?? null,
    tree.id,
    tree.instanceId ?? null
  ])
}

export function versionMaterialSelection(tree: Worktree) {
  const workflow = cycleWorkflowForWorktree(tree)
  if (!workflow || tree.isArchived) {
    return null
  }
  const scope = nativeWorkspaceScope(tree)
  return {
    repoId: scope.repoId,
    hostId: scope.runtimeOwnerEnvironmentId
      ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
      : scope.hostId,
    selection: { treeKey: versionTreeKey(tree), workflow }
  }
}
