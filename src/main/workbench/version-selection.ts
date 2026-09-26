import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { VersionMaterialScope } from '../../shared/workbench/version-material-request'
import { MaterialVersion } from '../../shared/workbench/version-material'
import { nativeWorkbenchWorkspaceHost, createWorkbenchWorkspaceResolver } from './workspace-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'
import { branchSelectorMatches } from '../runtime/runtime-worktree-path-identity'

/** A workflow's current version is a native worktree preference, never a second session store. */
export async function versionSelection(runtime: OrcaRuntimeService, scope: VersionMaterialScope, version?: string) {
  const { target, reauthorize } = await createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime)).resolve(scope)
  const worktree = await runtime.showManagedWorktree(`id:${scope.worktreeId}`, target.hostId)
  const branch = scope.workflow === 'plan' ? 'bw/week-plan' : 'bw/week-acceptance'
  if (!branchSelectorMatches(worktree.branch, branch)) {throw new WorkspaceScopeError('wrong-branch', `请使用 ${branch} 工作树`)}
  if (version !== undefined) {
    MaterialVersion.parse(version)
    await reauthorize()
    if (!worktree.identity?.key) {throw new WorkspaceScopeError('workspace-unavailable', '工作树身份不可用，请刷新后重试')}
    await runtime.updateManagedWorktreeMeta(`identity:${worktree.identity.key}`, { workbenchSelectedVersion: version })
  }
  return { version: version ?? worktree.workbenchSelectedVersion ?? null }
}
