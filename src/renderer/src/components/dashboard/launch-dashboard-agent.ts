import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useAppStore } from '@/store'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { DashboardSpawnAgentArgs } from '../../../../shared/dashboard-snapshot'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import { ensureAgentLaunchPreferences } from '@/runtime/agent-launch-settings/use-host-agent-launch-preferences'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'

/** Starts the requested agent through the same host-aware tab path as Quick Launch. */
export async function launchDashboardAgent({
  worktreeId,
  agent
}: DashboardSpawnAgentArgs): Promise<boolean> {
  const state = useAppStore.getState()
  const executionHostId = getExecutionHostIdForWorktree(state, worktreeId)
  const worktree = state.getKnownWorktreeById(worktreeId, executionHostId)
  if (!worktree) {
    return false
  }
  const host = parseExecutionHostId(executionHostId)
  const getInstanceKey = (): string | null =>
    host?.kind === 'runtime'
      ? JSON.stringify([
          getRuntimeEnvironmentRevision(host.environmentId),
          useAppStore.getState().runtimeStatusByEnvironmentId.get(host.environmentId)?.status?.runtimeId
        ])
      : null
  const instanceKey = getInstanceKey()
  const preferences = await ensureAgentLaunchPreferences(worktreeId).catch(() => null)
  if (preferences && !preferences.isAvailable) {
    toast.error(
      translate(
        'settings.agents.readFailed',
        'Couldn’t read agent settings. Check the host connection and try again.'
      )
    )
    return false
  }
  const current = useAppStore.getState()
  if (
    !preferences?.isAvailable ||
    !isTuiAgentEnabled(agent, preferences.disabledTuiAgents) ||
    getInstanceKey() !== instanceKey ||
    getExecutionHostIdForWorktree(current, worktreeId) !== executionHostId ||
    !current.getKnownWorktreeById(worktreeId, executionHostId)
  ) {
    return false
  }
  current.setActiveWorktree(worktreeId, executionHostId)
  return (
    launchAgentInNewTab({
      agent,
      worktreeId,
      launchSource: 'unknown'
    }) !== null
  )
}
