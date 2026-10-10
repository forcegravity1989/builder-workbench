import type { ConnectorListResult } from '../../../../shared/workbench/connector-status'
import type { VersionMaterialResult } from '../../../../shared/workbench/version-material-request'
import { callRuntimeRpc } from '../../runtime/runtime-rpc-client'

/** 两家 CLI 只读本机配置，所以始终问本机 runtime；主进程单家 30 秒超时，这里留余量。 */
export async function listConnectors(repoId: string | null): Promise<ConnectorListResult> {
  const result = await callRuntimeRpc<VersionMaterialResult<ConnectorListResult>>(
    { kind: 'local' },
    'workbench.connectors.list',
    repoId ? { repoId } : {},
    { timeoutMs: 45_000 }
  )
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.value
}
