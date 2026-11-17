import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import type { Worktree } from '../../../shared/worktree/types'
import type { VersionCatalogPlanTree } from './version-catalog-load'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'

export function versionCatalogPlanTrees(worktrees: readonly Worktree[]): VersionCatalogPlanTree[] {
  const trees: VersionCatalogPlanTree[] = []
  const ownerOf = (tree: Worktree) => {
    try {
      const treeScope = nativeWorkspaceScope(tree)
      return {
        repoId: treeScope.repoId,
        hostId: treeScope.hostId,
        ...(treeScope.runtimeOwnerEnvironmentId
          ? { runtimeOwnerEnvironmentId: treeScope.runtimeOwnerEnvironmentId }
          : {})
      }
    } catch (reason) {
      // 不能把远端归属不明的树回落到主树或本机读取。
      return {
        repoId: tree.repoId,
        hostId: tree.hostId,
        runtimeOwnerEnvironmentId: tree.runtimeOwnerEnvironmentId,
        ownerError: reason instanceof Error ? reason.message : String(reason)
      }
    }
  }
  for (const tree of worktrees) {
    if (tree.isArchived) {
      continue
    }
    const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
    if (binding?.workflow === 'plan') {
      trees.push({
        worktreeId: tree.id,
        instanceId: tree.instanceId,
        version: binding.version,
        ...ownerOf(tree)
      })
    }
  }
  return trees
}
