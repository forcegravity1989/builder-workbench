import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { pickSourceControlLaunchAgent } from '@/lib/source-control-launch-agent-selection'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import {
  ensureAgentLaunchPreferences,
  readHostAgentLaunchPreferences
} from '@/runtime/agent-launch-settings/use-host-agent-launch-preferences'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import type { Repo } from '../../../shared/repo-types'
import type { TuiAgent } from '../../../shared/tui-agent'

type SavedAgentOverrideResult =
  | { kind: 'agent'; agent: TuiAgent }
  | { kind: 'launch-default' }
  | { kind: 'blocked' }

async function detectAgentsForConnection(
  connectionId: string | null | undefined,
  runtimeEnvironmentId?: string | null
): Promise<TuiAgent[]> {
  const store = useAppStore.getState()
  return runtimeEnvironmentId
    ? await store.ensureRuntimeDetectedAgents(runtimeEnvironmentId)
    : typeof connectionId === 'string'
      ? await store.ensureRemoteDetectedAgents(connectionId)
      : await store.ensureDetectedAgents()
}

function isAgentAvailable(
  agent: TuiAgent,
  detectedAgents: TuiAgent[],
  disabledAgents: readonly TuiAgent[] | undefined
): boolean {
  return detectedAgents.includes(agent) && isTuiAgentEnabled(agent, disabledAgents)
}

function requireAgentPreferences(isAvailable: boolean): void {
  if (!isAvailable) {
    throw new Error(
      translate(
        'settings.agents.readFailed',
        'Couldn’t read agent settings. Check the host connection and try again.'
      )
    )
  }
}

export async function resolveSavedAgentOverride(
  savedAgent: TuiAgent | null | undefined,
  repo: Repo | null,
  assertOwner: () => void
): Promise<SavedAgentOverrideResult> {
  if (!savedAgent) {
    return { kind: 'launch-default' }
  }
  assertOwner()
  const host = repo ? parseExecutionHostId(getRepoExecutionHostId(repo)) : null
  const environmentId = host?.kind === 'runtime' ? host.environmentId : null
  const state = useAppStore.getState()
  const owner = environmentId
    ? {
        environmentId,
        pairingRevision: getRuntimeEnvironmentRevision(environmentId),
        runtimeId: state.runtimeStatusByEnvironmentId.get(environmentId)?.status?.runtimeId
      }
    : null
  const detectedAgents = await detectAgentsForConnection(repo?.connectionId, environmentId)
  assertOwner()
  const currentSettings = useAppStore.getState().settings
  const preferences = owner
    ? await readHostAgentLaunchPreferences(owner)
    : { ...currentSettings, isAvailable: currentSettings !== null }
  assertOwner()
  requireAgentPreferences(preferences.isAvailable)
  if (!isAgentAvailable(savedAgent, detectedAgents, preferences?.disabledTuiAgents)) {
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.4c7f783a7a',
        'Saved checks agent is not available on this workspace host.'
      )
    )
    return { kind: 'blocked' }
  }
  return { kind: 'agent', agent: savedAgent }
}

export async function pickExistingWorktreeAgent(
  worktreeId: string,
  savedAgent: TuiAgent | null | undefined,
  repoConnectionId: string | null | undefined,
  assertOwner: () => void
): Promise<TuiAgent | null> {
  assertOwner()
  const connectionId = getConnectionId(worktreeId) ?? repoConnectionId ?? null
  const environmentId = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
  const detectedAgents = await detectAgentsForConnection(connectionId, environmentId)
  assertOwner()
  const settings = await ensureAgentLaunchPreferences(worktreeId)
  assertOwner()
  requireAgentPreferences(settings.isAvailable)
  if (savedAgent) {
    if (isAgentAvailable(savedAgent, detectedAgents, settings.disabledTuiAgents)) {
      return savedAgent
    }
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.4c7f783a7a',
        'Saved checks agent is not available on this workspace host.'
      )
    )
    return null
  }
  const agent = pickSourceControlLaunchAgent({
    defaultAgent: settings?.defaultTuiAgent,
    detectedAgents,
    disabledAgents: settings?.disabledTuiAgents
  })
  if (!agent) {
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.2ebf794906',
        'No enabled AI agent was detected on this workspace host.'
      )
    )
  }
  return agent
}
