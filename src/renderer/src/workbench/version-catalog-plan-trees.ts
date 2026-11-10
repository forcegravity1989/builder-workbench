import { branchName } from '@/lib/git-utils'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import type { Worktree } from '../../../shared/worktree/types'
import type { VersionCatalogPlanTree } from './version-catalog-load'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { cycleBranch } from './version-cycle/native-cycle-workspace'

export function versionCatalogPlanTrees(worktrees: readonly Worktree[]): VersionCatalogPlanTree[] {
  const trees: VersionCatalogPlanTree[] = []
  const legacyTrees: VersionCatalogPlanTree[] = []
  const legacyBranch = cycleBranch({ workflow: 'plan' })
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
      continue
    }
    if (!binding && branchName(tree.branch) === legacyBranch) {
      legacyTrees.push({
        worktreeId: tree.id,
        instanceId: tree.instanceId,
        version: null,
        ...ownerOf(tree)
      })
    }
  }
  // 绑定树排前：目录 goals 派生按先到先得，绑定副本优先于旧固定树副本（C-2）。
  return [...trees, ...legacyTrees]
}
