import type { useAppStore } from '@/store'
import type { LaunchAgentBackgroundSessionArgs } from './agent-background-session-contract'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'
import { requireTuiAgentConfig } from '../../../shared/require-tui-agent-config'
import { resolveAgentBackgroundLaunchHost } from '@/lib/agent-background-session-launch-host'
import { getSettingsForWorktreeRuntimeOwner } from '@/lib/worktree-runtime-owner'
import {
  resolveHostAgentStartupShell,
  resolveLocalWindowsAgentStartupShell
} from '../../../shared/windows-terminal-shell'
import { lastVerifiedRuntimeStatus } from '../../../shared/runtime-host-status'
import { readHostAgentStartupSettings } from '@/runtime/agent-launch-settings/agent-launch-settings-transport'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'

/** Resolve the execution host and prepare its launch recipe before reserving a run tab. */
export async function prepareAgentBackgroundStartup({
  store,
  agent,
  worktreeId,
  prompt
}: Pick<LaunchAgentBackgroundSessionArgs, 'agent' | 'worktreeId' | 'prompt'> & {
  store: ReturnType<typeof useAppStore.getState>
}) {
  // Folder workspaces exist only in getKnownWorktreeById (#2989).
  const worktree = store.getKnownWorktreeById(worktreeId)
  const repo = worktree ? store.repos.find((entry) => entry.id === worktree.repoId) : null
  if (!worktree) {
    throw new Error('The target workspace is no longer available.')
  }
  const runtimeTarget = getActiveRuntimeTarget(getSettingsForWorktreeRuntimeOwner(store, worktreeId))
  const environmentId = runtimeTarget.kind === 'environment' ? runtimeTarget.environmentId : null
  const pairingRevision = environmentId ? getRuntimeEnvironmentRevision(environmentId) : undefined
  const hostStatus = environmentId
    ? lastVerifiedRuntimeStatus(store.runtimeStatusByEnvironmentId.get(environmentId))
    : null
  const hostSettings = environmentId
    ? await readHostAgentStartupSettings({
        environmentId,
        pairingRevision,
        runtimeId: hostStatus?.runtimeId
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error
        }
        return null
      })
    : null
  if (environmentId && getRuntimeEnvironmentRevision(environmentId) !== pairingRevision) {
    throw new DOMException('Agent launch cancelled', 'AbortError')
  }
  const launchSettings = hostSettings ?? store.settings
  const cmdOverrides = launchSettings?.agentCmdOverrides ?? {}
  const agentArgs = resolveTuiAgentLaunchArgs(agent, launchSettings?.agentDefaultArgs)
  const agentEnv = resolveTuiAgentLaunchEnv(agent, launchSettings?.agentDefaultEnv)
  // Folder launch ownership cannot be derived from a repo row (#2989).
  const launchHost = resolveAgentBackgroundLaunchHost({
    store,
    worktreeId,
    worktreePath: worktree.path,
    repo
  })
  const preflight = requireTuiAgentConfig(agent).preflightTrust
  if (preflight && worktree.path && window.api.agentTrust?.markTrusted) {
    try {
      await window.api.agentTrust.markTrusted({
        preset: preflight,
        workspacePath: worktree.path,
        ...(launchHost.connectionId ? { connectionId: launchHost.connectionId } : {})
      })
    } catch {
      // Best-effort: the user can still accept the trust prompt.
    }
  }
  const { isRemote } = launchHost
  const launchPlatform = hostSettings ? hostStatus?.hostPlatform ?? 'linux' : launchHost.platform
  const startupShell = hostSettings
    ? resolveHostAgentStartupShell({
        platform: launchPlatform,
        isRemote: true,
        hostTerminalWindowsShell: hostStatus?.terminalWindowsShell
      })
    : resolveLocalWindowsAgentStartupShell({
        platform: launchPlatform,
        isRemote,
        terminalWindowsShell: store.settings?.terminalWindowsShell
      })
  const trimmedPrompt = prompt?.trim() ?? ''
  const hasPrompt = trimmedPrompt.length > 0
  const isFollowupPath = requireTuiAgentConfig(agent).promptInjectionMode === 'stdin-after-start'

  const pasteDraftAfterLaunch = hasPrompt && isFollowupPath ? trimmedPrompt : null
  const startupPlan = buildAgentStartupPlan({
    agent,
    prompt: hasPrompt && !isFollowupPath ? trimmedPrompt : '',
    cmdOverrides,
    agentArgs,
    agentEnv,
    platform: launchPlatform,
    shell: startupShell,
    isRemote,
    allowEmptyPromptLaunch: !hasPrompt || isFollowupPath
  })
  if (!startupPlan) {
    return null
  }

  return {
    worktree,
    runtimeTarget,
    pairingRevision,
    hostStatus,
    launchHost,
    hasPrompt,
    isFollowupPath,
    trimmedPrompt,
    pasteDraftAfterLaunch,
    startupPlan
  }
}
