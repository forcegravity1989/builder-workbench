import { assertRuntimeEnvironmentCapability, callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { routeForOwner } from '../lib/worktree-owner-route'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { ownerSpelledHostId } from './version-binding-port'
import { WORKBENCH_VERSION_WORKSPACE_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import { VersionMaterialPortError } from '../../../shared/workbench/version-material-client'
import type { VersionMaterialResult } from '../../../shared/workbench/version-material-request'
import type {
  VersionWorkspacePrepareRequest,
  VersionWorkspacePrepareResult
} from '../../../shared/workbench/version-workspace-prepare'

/**
 * G2 新版本准备的客户端入口（P3a）：永远路由到归属宿主 runtime（树与绑定在
 * 归属宿主创建，不在访问者机建树）；对端不支持准备能力时如实报错，不回落本机。
 * 重入同一 prepare 即按宿主真实登记补齐（P2 语义），调用方可安全重试。
 */
export function nativeVersionWorkspacePort(owner: {
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
  return {
    async prepare(request: VersionWorkspacePrepareRequest): Promise<VersionWorkspacePrepareResult> {
      if (target.kind === 'environment') {
        await assertRuntimeEnvironmentCapability(
          target.environmentId,
          WORKBENCH_VERSION_WORKSPACE_RUNTIME_CAPABILITY,
          '对端 Orca 尚不支持新版本准备，请更新归属宿主后再试'
        )
      }
      // Why: 同绑定端口——owner 侧 resolver 只认 owner 拼写，访客侧 runtime:<env> 必拒；
      // 路由经 runtimeOwnerEnvironmentId 已指向归属宿主。
      const spelled = { ...request, hostId: ownerSpelledHostId(request.hostId) }
      const result = await callRuntimeRpc<VersionMaterialResult<VersionWorkspacePrepareResult>>(
        target,
        'workbench.versionWorkspace.prepare',
        spelled,
        // 建两棵树含 checkout/setup：与原生 worktree.create 同量级放宽超时。
        { timeoutMs: 600_000 }
      )
      if (!result.ok) {
        throw new VersionMaterialPortError(result.error.code, result.error.message)
      }
      return result.value
    }
  }
}
