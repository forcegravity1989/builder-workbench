import { assertRuntimeEnvironmentCapability, callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { routeForOwner } from '../lib/worktree-owner-route'
import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import { WORKBENCH_VERSION_BINDING_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import { VersionMaterialPortError } from '../../../shared/workbench/version-material-client'
import type { VersionMaterialResult } from '../../../shared/workbench/version-material-request'
import type {
  VersionBindingScope,
  VersionBindingSetRequest,
  WorkbenchVersionBinding
} from '../../../shared/workbench/version-binding'

/**
 * G2 版本绑定的客户端入口：读写永远路由到归属宿主 runtime（共享端读 owner 的
 * 原生登记，不在访问者机建树、不落本机副本）；对端不支持绑定契约或授权已撤销
 * 时如实抛错，不静默忽略字段、不回落本机路径。
 */
// Why: 归属宿主 resolver 只认 owner 侧拼写（local/ssh:X），访客侧 runtime:<env> 拼写
// 会被拒；路由已由 routeForOwner 按 runtimeOwnerEnvironmentId 走对端，scope 里只需
// owner 拼写——与 version-material-port 的 ownerScope 重写同一口径。
/** owner 侧宿主拼写单实现（最终检视 L-5）：访客 runtime:<env> → owner local。 */
export function ownerSpelledHostId(hostId: string): string {
  return parseExecutionHostId(hostId)?.kind === 'runtime' ? LOCAL_EXECUTION_HOST_ID : hostId
}

function ownerSpelledScope<T extends { hostId: string }>(scope: T): T {
  return parseExecutionHostId(scope.hostId)?.kind === 'runtime'
    ? { ...scope, hostId: ownerSpelledHostId(scope.hostId) }
    : scope
}

export function nativeVersionBindingPort(owner: {
  hostId: ExecutionHostId
  runtimeOwnerEnvironmentId?: string
}) {
  const route = routeForOwner(owner)
  if (!route) {
    throw new VersionMaterialPortError('invalid-scope', '工作树宿主身份不可用')
  }
  const target = route.runtimeEnvironmentId
    ? { kind: 'environment' as const, environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' as const }

  async function invoke<T>(operation: 'read' | 'set', params: unknown): Promise<T> {
    if (target.kind === 'environment') {
      await assertRuntimeEnvironmentCapability(
        target.environmentId,
        WORKBENCH_VERSION_BINDING_RUNTIME_CAPABILITY,
        '对端 Orca 尚不支持版本绑定，请更新归属宿主后重试'
      )
    }
    const result = await callRuntimeRpc<VersionMaterialResult<T>>(
      target,
      `workbench.versionBinding.${operation}`,
      params
    )
    if (!result.ok) {
      throw new VersionMaterialPortError(
        result.error.code,
        result.error.message,
        result.error.currentRevision
      )
    }
    return result.value
  }

  return {
    read: (scope: VersionBindingScope) =>
      invoke<WorkbenchVersionBinding | null>('read', ownerSpelledScope(scope)),
    set: (
      scope: VersionBindingScope,
      binding: WorkbenchVersionBinding | null,
      linkedWorkItem?: VersionBindingSetRequest['linkedWorkItem']
    ) =>
      invoke<WorkbenchVersionBinding | null>('set', {
        ...ownerSpelledScope(scope),
        binding,
        ...(linkedWorkItem ? { linkedWorkItem } : {})
      })
  }
}
