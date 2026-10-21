import { parseExecutionHostId } from '../../../shared/execution-host'
import type { PublicKnownRuntimeEnvironment } from '../../../shared/runtime-environments'
import type { RuntimeEnvironmentStatus } from '../store/slices/runtime-status-types'

export type WallHostFact = {
  hostId: string
  /** 来源标签:本机 / 配对名 / SSH 目标标签。 */
  label: string
  /**
   * runtime 主机连接事实(由 Orca runtime 状态推导):true=在线,false=离线,
   * null=未探测未知。本机/SSH 不假装知道连接态,恒为 null。只作事实呈现,
   * 不冒充项目健康(铁律二)。
   */
  online: boolean | null
}

export function buildWallHostFact(
  hostId: string,
  environments: readonly PublicKnownRuntimeEnvironment[],
  statusByEnvironmentId: ReadonlyMap<string, RuntimeEnvironmentStatus>,
  sshTargetLabels: ReadonlyMap<string, string>
): WallHostFact {
  const parsed = parseExecutionHostId(hostId)
  if (!parsed || parsed.kind === 'local') {
    return { hostId, label: '本机', online: null }
  }
  if (parsed.kind === 'runtime') {
    const environment = environments.find((entry) => entry.id === parsed.environmentId)
    const status = statusByEnvironmentId.get(parsed.environmentId)
    return {
      hostId,
      label: environment?.name || parsed.environmentId,
      online: status === undefined ? null : status.status !== null
    }
  }
  return { hostId, label: sshTargetLabels.get(parsed.targetId) || parsed.targetId, online: null }
}
