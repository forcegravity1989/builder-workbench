import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '../runtime-rpc-client'
import {
  AGENT_LAUNCH_SETTINGS_CAPABILITY,
  type AgentLaunchSettings,
  type AgentLaunchSettingsMutation
} from '../../../../shared/agent-launch-settings'

export type AgentLaunchSettingsOwner = {
  environmentId: string
  pairingRevision?: number
  runtimeId?: string
}

type SettingsListener = (owner: AgentLaunchSettingsOwner) => void
const settingsListeners = new Set<SettingsListener>()

export function subscribeHostAgentLaunchSettings(listener: SettingsListener): () => void {
  settingsListeners.add(listener)
  return () => {
    settingsListeners.delete(listener)
  }
}

export async function readHostAgentLaunchSettings(
  owner: AgentLaunchSettingsOwner,
  signal?: AbortSignal
): Promise<AgentLaunchSettings | null> {
  if (
    !(await runtimeEnvironmentSupportsCapability(
      owner.environmentId,
      AGENT_LAUNCH_SETTINGS_CAPABILITY,
      15_000
    ))
  ) {
    return null
  }
  const result = await callRuntimeRpc<{ settings: AgentLaunchSettings }>(
    { kind: 'environment', environmentId: owner.environmentId },
    'settings.getAgentLaunch',
    undefined,
    {
      expectedEnvironmentPairingRevision: owner.pairingRevision,
      expectedEnvironmentRuntimeId: owner.runtimeId,
      signal,
      timeoutMs: 15_000
    }
  )
  return result.settings
}

export async function mutateHostAgentLaunchSettings(
  owner: AgentLaunchSettingsOwner,
  mutation: AgentLaunchSettingsMutation,
  signal?: AbortSignal
): Promise<AgentLaunchSettings> {
  const result = await callRuntimeRpc<{ settings: AgentLaunchSettings }>(
    { kind: 'environment', environmentId: owner.environmentId },
    'settings.mutateAgentLaunch',
    mutation,
    {
      expectedEnvironmentPairingRevision: owner.pairingRevision,
      expectedEnvironmentRuntimeId: owner.runtimeId,
      signal,
      timeoutMs: 15_000
    }
  )
  for (const listener of settingsListeners) listener(owner)
  return result.settings
}

export type HostAgentStartupSettings = Partial<
  Pick<
    GlobalSettings,
    | 'defaultTuiAgent'
    | 'disabledTuiAgents'
    | 'agentCmdOverrides'
    | 'agentDefaultArgs'
    | 'agentDefaultEnv'
  >
>

function usableHostAgentStartupSettings(value: unknown): value is HostAgentStartupSettings {
  const record = (item: unknown): item is Record<string, unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
  const strings = (item: unknown): boolean =>
    record(item) && Object.values(item).every((entry) => typeof entry === 'string')
  return (
    record(value) &&
    (value.defaultTuiAgent === undefined ||
      value.defaultTuiAgent === null ||
      typeof value.defaultTuiAgent === 'string') &&
    (value.disabledTuiAgents === undefined ||
      (Array.isArray(value.disabledTuiAgents) &&
        value.disabledTuiAgents.every((entry) => typeof entry === 'string'))) &&
    (value.agentCmdOverrides === undefined || strings(value.agentCmdOverrides)) &&
    (value.agentDefaultArgs === undefined || strings(value.agentDefaultArgs)) &&
    (value.agentDefaultEnv === undefined ||
      (record(value.agentDefaultEnv) && Object.values(value.agentDefaultEnv).every(strings)))
  )
}

export async function readHostAgentStartupSettings(
  owner: AgentLaunchSettingsOwner,
  signal?: AbortSignal
): Promise<HostAgentStartupSettings | null> {
  const result = await callRuntimeRpc<{ settings?: unknown }>(
    { kind: 'environment', environmentId: owner.environmentId },
    'settings.get',
    undefined,
    {
      expectedEnvironmentPairingRevision: owner.pairingRevision,
      ...(owner.runtimeId ? { expectedEnvironmentRuntimeId: owner.runtimeId } : {}),
      signal,
      timeoutMs: 15_000
    }
  )
  return usableHostAgentStartupSettings(result?.settings) ? result.settings : null
}
