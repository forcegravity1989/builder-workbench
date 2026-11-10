import type { GlobalSettings } from './global-settings-types'
import type { TuiAgent } from './tui-agent'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import { normalizeDisabledTuiAgents } from './tui-agent-selection'
import { normalizeTuiAgentArgsRecord, resolveTuiAgentLaunchEnv } from './tui-agent-launch-defaults'
import {
  applyAgentPermissionMode,
  resolveAgentPermissionModeSummary,
  type AgentPermissionMode
} from './tui-agent-permissions'

export const AGENT_LAUNCH_SETTINGS_CAPABILITY = 'settings.agent-launch.v1' as const

export type AgentLaunchSettingsSource = Partial<
  Pick<
    GlobalSettings,
    | 'defaultTuiAgent'
    | 'disabledTuiAgents'
    | 'agentCmdOverrides'
    | 'agentDefaultArgs'
    | 'agentDefaultEnv'
  >
>

export type AgentLaunchSettings = {
  defaultTuiAgent: GlobalSettings['defaultTuiAgent']
  disabledTuiAgents: TuiAgent[]
  agentCmdOverrides: NonNullable<GlobalSettings['agentCmdOverrides']>
  agentDefaultArgs: NonNullable<GlobalSettings['agentDefaultArgs']>
  environmentNames: Partial<Record<TuiAgent, string[]>>
  permissionMode: AgentPermissionMode
}

export type AgentLaunchSettingsMutation =
  | { type: 'default'; agent: GlobalSettings['defaultTuiAgent']; setupOnly?: boolean }
  | { type: 'availability'; agent: TuiAgent; enabled: boolean }
  | { type: 'permissions'; mode: Exclude<AgentPermissionMode, 'mixed'> }
  | { type: 'command'; agent: TuiAgent; value: string }
  | { type: 'arguments'; agent: TuiAgent; value: string }
  | { type: 'environment-set'; agent: TuiAgent; name: string; value: string }
  | { type: 'environment-remove'; agent: TuiAgent; name: string }

export function projectAgentLaunchSettings(
  settings: AgentLaunchSettingsSource
): AgentLaunchSettings {
  return {
    defaultTuiAgent: settings.defaultTuiAgent ?? null,
    disabledTuiAgents: normalizeDisabledTuiAgents(settings.disabledTuiAgents),
    agentCmdOverrides: { ...settings.agentCmdOverrides },
    agentDefaultArgs: normalizeTuiAgentArgsRecord(settings.agentDefaultArgs),
    environmentNames: Object.fromEntries(
      (Object.keys(TUI_AGENT_CONFIG) as TuiAgent[]).map((agent) => [
        agent,
        Object.keys(resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv)).sort()
      ])
    ),
    permissionMode: resolveAgentPermissionModeSummary(settings)
  }
}

export function agentLaunchSettingsMutationUpdates(
  settings: AgentLaunchSettingsSource,
  mutation: AgentLaunchSettingsMutation,
  platform: NodeJS.Platform
): AgentLaunchSettingsSource {
  switch (mutation.type) {
    case 'default':
      return { defaultTuiAgent: mutation.agent }
    case 'availability': {
      const disabled = normalizeDisabledTuiAgents(settings.disabledTuiAgents)
      return {
        disabledTuiAgents: mutation.enabled
          ? disabled.filter((agent) => agent !== mutation.agent)
          : disabled.includes(mutation.agent)
            ? disabled
            : [...disabled, mutation.agent],
        ...(settings.defaultTuiAgent === mutation.agent && !mutation.enabled
          ? { defaultTuiAgent: null }
          : {})
      }
    }
    case 'permissions':
      return applyAgentPermissionMode({ ...settings, mode: mutation.mode })
    case 'command': {
      const commands = { ...settings.agentCmdOverrides }
      if (mutation.value.trim()) {
        commands[mutation.agent] = mutation.value.trim()
      } else {
        delete commands[mutation.agent]
      }
      return { agentCmdOverrides: commands }
    }
    case 'arguments':
      return {
        agentDefaultArgs: normalizeTuiAgentArgsRecord({
          ...settings.agentDefaultArgs,
          [mutation.agent]: mutation.value
        })
      }
    case 'environment-set':
    case 'environment-remove': {
      const env = { ...resolveTuiAgentLaunchEnv(mutation.agent, settings.agentDefaultEnv) }
      for (const name of Object.keys(env)) {
        if (
          name === mutation.name ||
          (platform === 'win32' && name.toLowerCase() === mutation.name.toLowerCase())
        ) {
          delete env[name]
        }
      }
      const nextEnv =
        mutation.type === 'environment-set' ? { ...env, [mutation.name]: mutation.value } : env
      return { agentDefaultEnv: { ...settings.agentDefaultEnv, [mutation.agent]: nextEnv } }
    }
  }
}
