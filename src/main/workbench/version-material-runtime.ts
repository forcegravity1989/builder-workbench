import { parseExecutionHostId } from '../../shared/execution-host'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'
import { VersionDocumentError } from '../../shared/workbench/version-document'
import { getActiveMultiplexer } from '../ssh/ssh-target-registry'
import {
  createVersionMaterialService,
  type VersionMaterialExecutor
} from './version-material-service'
import { nativeWorkbenchWorkspaceHost } from './workspace-resolver'
import { createVersionMaterialWorkspace } from './version-material-workspace'
import { WorkspaceScopeError } from './workspace-scope-error'

export const executeVersionMaterial: VersionMaterialExecutor = (target, reauthorize) => {
  const host = parseExecutionHostId(target.hostId)
  if (host?.kind === 'local') {
    return createVersionMaterialWorkspace(target, reauthorize)
  }
  // Paired runtimes are selected by Orca's caller; only their own SSH namespace is used here.
  if (host?.kind !== 'ssh') {
    throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 访问材料')
  }
  const connectionId = host.targetId
  async function call<T>(operation: string, request: unknown): Promise<T> {
    await reauthorize()
    const channel = getActiveMultiplexer(connectionId)
    if (!channel) {
      throw new WorkspaceScopeError('host-unavailable', '工作树所属的 SSH 主机未连接')
    }
    const result = (await channel.request('workbench.materials.execute', {
      target: { repoPath: target.repoPath, worktreePath: target.worktreePath },
      operation,
      request
    })) as VersionMaterialResult<T>
    if (!result.ok) {
      if (result.error.code === 'revision-conflict') {
        throw new VersionDocumentError(
          'revision-conflict',
          result.error.message,
          result.error.currentRevision
        )
      }
      throw new WorkspaceScopeError(result.error.code, result.error.message)
    }
    return result.value
  }
  return {
    previewMigration: (request) => call('previewMigration', request),
    migrate: (request) => call('migrate', request),
    list: (request) => call('list', request),
    read: (request) => call('read', request),
    save: (request) => call('save', request)
  }
}

/** A BW composition adapter over Orca's existing public inventory and relay APIs. */
export function nativeVersionMaterialService(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]
) {
  return createVersionMaterialService(nativeWorkbenchWorkspaceHost(runtime), executeVersionMaterial)
}
