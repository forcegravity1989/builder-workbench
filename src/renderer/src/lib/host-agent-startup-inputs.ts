import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  readHostAgentStartupSettings,
  type AgentLaunchSettingsOwner,
  type HostAgentStartupSettings
} from '@/runtime/agent-launch-settings/agent-launch-settings-transport'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { assertAgentLaunchSettingsOwner } from '@/runtime/agent-launch-settings/agent-launch-settings-owner'
import { resolveHostAgentStartupShell } from '../../../shared/windows-terminal-shell'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import type { AgentStartupShell } from '../../../shared/tui-agent-startup-shell'
import type { TuiAgent } from '../../../shared/tui-agent'

export type PreparedHostAgentStartup = {
  owner?: AgentLaunchSettingsOwner
  hostOwned: boolean
  inputs: {
    cmdOverrides: Partial<Record<TuiAgent, string>>
    agentArgs?: string | null
    agentEnv?: Record<string, string>
    platform: NodeJS.Platform
    shell?: AgentStartupShell
    isRemote: boolean
  }
}

function hostSettingsReadError(): Error {
  return new Error(
    translate(
      'settings.agents.readFailed',
      'Couldn’t read agent settings. Check the host connection and try again.'
    )
  )
}

export function assertHostAgentStartupOwner(
  owner: AgentLaunchSettingsOwner | undefined,
  environmentId = owner?.environmentId
): void {
  assertAgentLaunchSettingsOwner(useAppStore.getState(), owner, environmentId)
}

/** The native legacy launch recipe, prepared for the selected paired host before creation. */
export async function prepareHostAgentStartupInputs(args: {
  environmentId: string | null | undefined
  agent: TuiAgent | null
  settings: HostAgentStartupSettings | null | undefined
  platform: NodeJS.Platform
  shell?: AgentStartupShell | null
  isRemote: boolean
  agentArgs?: string | null
}): Promise<PreparedHostAgentStartup> {
  const { environmentId, agent } = args
  const status = environmentId
    ? useAppStore.getState().runtimeStatusByEnvironmentId.get(environmentId)?.status
    : null
  const owner: AgentLaunchSettingsOwner | undefined = environmentId
    ? {
        environmentId,
        pairingRevision: getRuntimeEnvironmentRevision(environmentId),
        runtimeId: status?.runtimeId
      }
    : undefined
  // The recipe and the later create must name the same verified runtime instance.
  if (owner && agent && (!owner.runtimeId || owner.pairingRevision === undefined)) {
    throw hostSettingsReadError()
  }
  const hostSettings =
    owner && agent
      ? await readHostAgentStartupSettings(owner).catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') {
            throw error
          }
          return null
        })
      : null
  assertHostAgentStartupOwner(owner)
  if (owner && agent && !hostSettings) {
    throw hostSettingsReadError()
  }
  const settings = hostSettings ?? args.settings
  if (agent && hostSettings && !isTuiAgentEnabled(agent, hostSettings.disabledTuiAgents)) {
    throw new Error(
      translate(
        'auto.hooks.useComposerState.7eb3f44ff7',
        'Selected agent is disabled. Choose an enabled agent before creating.'
      )
    )
  }
  const platform = hostSettings ? (status?.hostPlatform ?? 'linux') : args.platform
  return {
    owner,
    hostOwned: hostSettings !== null,
    inputs: {
      cmdOverrides: settings?.agentCmdOverrides ?? {},
      agentArgs:
        args.agentArgs !== undefined
          ? args.agentArgs
          : agent
            ? resolveTuiAgentLaunchArgs(agent, settings)
            : undefined,
      agentEnv: agent ? resolveTuiAgentLaunchEnv(agent, settings) : undefined,
      platform,
      shell: hostSettings
        ? resolveHostAgentStartupShell({
            platform,
            isRemote: true,
            hostTerminalWindowsShell: status?.terminalWindowsShell
          })
        : (args.shell ?? undefined),
      isRemote: hostSettings ? true : args.isRemote
    }
  }
}
