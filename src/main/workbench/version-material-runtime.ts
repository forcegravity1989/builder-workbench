import { parseExecutionHostId } from '../../shared/execution-host/execution-host'
import {
  createVersionMaterialService,
  type VersionMaterialExecutor
} from './version-material-service'
import { nativeWorkbenchWorkspaceHost } from './workspace-resolver'
import { createVersionMaterialWorkspace } from './version-material-workspace'
import { WorkspaceScopeError } from './workspace-scope-error'

export const executeVersionMaterial: VersionMaterialExecutor = (target, reauthorize, binding) => {
  // The renderer routes paired worktrees to their owning runtime as a local workspace.
  if (parseExecutionHostId(target.hostId)?.kind !== 'local') {
    throw new WorkspaceScopeError('invalid-scope', '请通过 Orca 共享主机连接项目所在电脑后访问材料')
  }
  return createVersionMaterialWorkspace(target, reauthorize, binding ?? null)
}

export function nativeVersionMaterialService(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]
) {
  return createVersionMaterialService(nativeWorkbenchWorkspaceHost(runtime), executeVersionMaterial)
}
