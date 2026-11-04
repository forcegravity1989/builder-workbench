import { parseExecutionHostId } from '../../shared/execution-host'
import {
  createVersionMaterialService,
  type VersionMaterialExecutor
} from './version-material-service'
import { nativeWorkbenchWorkspaceHost } from './workspace-resolver'
import { createVersionMaterialWorkspace } from './version-material-workspace'
import { WorkspaceScopeError } from './workspace-scope-error'

/** Remote clients dispatch this method to the runtime owning the registered workspace. */
export const executeVersionMaterial: VersionMaterialExecutor = (target, reauthorize, binding) => {
  if (parseExecutionHostId(target.hostId)?.kind !== 'local') {
    throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 访问材料')
  }
  return createVersionMaterialWorkspace(target, reauthorize, binding ?? null)
}

export function nativeVersionMaterialService(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]
) {
  return createVersionMaterialService(nativeWorkbenchWorkspaceHost(runtime), executeVersionMaterial)
}
