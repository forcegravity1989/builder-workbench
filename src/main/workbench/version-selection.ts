import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { VersionMaterialScope } from '../../shared/workbench/version-material-request'
import { MaterialVersion } from '../../shared/workbench/version-material'
import { normalizeStoredWorkbenchVersionBinding } from '../../shared/workbench/version-binding'
import {
  nativeWorkbenchWorkspaceHost,
  createWorkbenchWorkspaceResolver
} from './workspace-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'

export async function versionSelection(
  runtime: OrcaRuntimeService,
  scope: VersionMaterialScope,
  version?: string
) {
  const { worktree } = await createWorkbenchWorkspaceResolver(
    nativeWorkbenchWorkspaceHost(runtime)
  ).resolve(scope)
  const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
  if (!binding || binding.workflow !== scope.workflow) {
    throw new WorkspaceScopeError('invalid-scope', '请使用绑定版本的流程工作区')
  }
  if (version !== undefined && MaterialVersion.parse(version) !== binding.version) {
    throw new WorkspaceScopeError('cross-version', '不能在一个版本的工作区选择另一个版本')
  }
  return { version: binding.version }
}
