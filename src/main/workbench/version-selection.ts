import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { VersionMaterialScope } from '../../shared/workbench/version-material-request'
import { MaterialVersion } from '../../shared/workbench/version-material'
import { normalizeStoredWorkbenchVersionBinding } from '../../shared/workbench/version-binding'
import {
  nativeWorkbenchWorkspaceHost,
  createWorkbenchWorkspaceResolver
} from './workspace-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'
import { branchSelectorMatches } from '../runtime/runtime-worktree-path-identity'

/** A workflow's current version is a native worktree preference, never a second session store. */
export async function versionSelection(
  runtime: OrcaRuntimeService,
  scope: VersionMaterialScope,
  version?: string
) {
  const { target, reauthorize } = await createWorkbenchWorkspaceResolver(
    nativeWorkbenchWorkspaceHost(runtime)
  ).resolve(scope)
  const worktree = await runtime.showManagedWorktree(`id:${scope.worktreeId}`, target.hostId)
  // G2 (P3a)：绑定树的版本由绑定决定（单一正本，不写第二份选版偏好）；
  // 跨版 select 拒绝。无绑定树保持旧固定分支语义逐字不变（旧上下文显式保留）。
  const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
  if (binding) {
    if (
      binding.workflow !== scope.workflow ||
      (binding.workflow !== 'plan' && binding.workflow !== 'acceptance')
    ) {
      throw new WorkspaceScopeError('invalid-scope', '该工作树不是此用途的流程树，选版被拒绝')
    }
    if (version !== undefined) {
      MaterialVersion.parse(version)
      if (version !== binding.version) {
        throw new WorkspaceScopeError(
          'cross-version',
          `该工作树绑定版本 ${binding.version}，拒绝选版 ${version}`
        )
      }
    }
    return { version: binding.version }
  }
  const branch = scope.workflow === 'plan' ? 'bw/week-plan' : 'bw/week-acceptance'
  if (!branchSelectorMatches(worktree.branch, branch)) {
    throw new WorkspaceScopeError('wrong-branch', `请使用 ${branch} 工作树`)
  }
  if (version !== undefined) {
    MaterialVersion.parse(version)
    await reauthorize()
    if (!worktree.identity?.key) {
      throw new WorkspaceScopeError('workspace-unavailable', '工作树身份不可用，请刷新后重试')
    }
    await runtime.updateManagedWorktreeMeta(`identity:${worktree.identity.key}`, {
      workbenchSelectedVersion: version
    })
  }
  return { version: version ?? worktree.workbenchSelectedVersion ?? null }
}
