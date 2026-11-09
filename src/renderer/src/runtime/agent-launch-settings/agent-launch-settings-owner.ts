import type { AppState } from '@/store/types'
import type { AgentLaunchSettingsOwner } from './agent-launch-settings-transport'
import { getRuntimeEnvironmentRevision } from '../runtime-environment-revision'

export function assertAgentLaunchSettingsOwner(
  state: Pick<AppState, 'runtimeStatusByEnvironmentId'>,
  owner: AgentLaunchSettingsOwner | undefined,
  environmentId = owner?.environmentId
): void {
  if (!owner) {
    return
  }
  const status = state.runtimeStatusByEnvironmentId.get(owner.environmentId)?.status
  if (
    environmentId !== owner.environmentId ||
    getRuntimeEnvironmentRevision(owner.environmentId) !== owner.pairingRevision ||
    (owner.runtimeId && status?.runtimeId !== owner.runtimeId)
  ) {
    throw new DOMException('Agent launch cancelled', 'AbortError')
  }
}
