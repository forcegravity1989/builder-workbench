import { useAppStore } from '@/store'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import type { WorktreeStartupPayload } from '@/lib/worktree-startup-payload'
import type { CreateWorktreeResult } from '../../../shared/worktree/create-types'
import { preflightAgentTrust } from '@/lib/agent-trust-preflight'
import { createNonSecureContextUuid } from "../../../shared/non-secure-context-uuid"
import { stopWorktreeCreationForChangedHost } from './worktree-creation-completion'
import type {
  WorktreeCreationPhase,
  WorktreeCreationRequest
} from '@/lib/pending-worktree-creation'

// Why: mirrors the startup-opt the composer used to build inline. The renderer
// only seeds the first terminal when the backend did not already spawn it.
export function buildWorktreeCreationStartupOpt(
  request: WorktreeCreationRequest,
  backendSpawned: boolean
): WorktreeStartupPayload | undefined {
  const plan = request.startupPlan
  if (!plan || backendSpawned) {
    return undefined
  }
  return {
    ...(request.agentLaunchOwner ? { agentLaunchOwner: request.agentLaunchOwner } : {}),
    command: plan.launchCommand,
    ...(plan.env ? { env: plan.env } : {}),
    launchConfig: plan.launchConfig,
    ...(plan.launchToken ? { launchToken: plan.launchToken } : {}),
    ...(request.agent ? { launchAgent: request.agent } : {}),
    ...(plan.draftPrompt ? { draftPrompt: plan.draftPrompt } : {}),
    // Why: view-mode only. An argv-prefill plan sets no draftPrompt, so this is
    // the sole signal that this launch starts with unsent context in the TUI.
    ...(request.launchDraftPrompt ? { launchDraftText: request.launchDraftPrompt } : {}),
    ...(plan.startupCommandDelivery ? { startupCommandDelivery: plan.startupCommandDelivery } : {}),
    // Why: command-code shows its prompt in the tab status before the first
    // hook fires, so the prompt is threaded through here.
    ...(request.agent === 'command-code' && request.quickPrompt.trim().length > 0
      ? { initialAgentStatus: { agent: request.agent, prompt: request.quickPrompt.trim() } }
      : {}),
    ...(request.quickTelemetry ? { telemetry: request.quickTelemetry } : {})
  }
}

type PreparedWorktreeCreationStartup = {
  backendSpawned: boolean
  fallbackStartupOpt: WorktreeStartupPayload | undefined
  startupOpt: WorktreeStartupPayload | undefined
}

export async function prepareWorktreeCreationStartup(
  creationId: string,
  request: WorktreeCreationRequest,
  result: CreateWorktreeResult
): Promise<PreparedWorktreeCreationStartup | null> {
  if (stopWorktreeCreationForChangedHost(creationId, request)) {
    return null
  }
  const backendSpawned = result.startupTerminal?.spawned === true
  if (request.startupPlan && !backendSpawned && !request.startupPlan.launchToken) {
    // Delayed delivery and the queued startup must identify the same newly spawned pane.
    request.startupPlan.launchToken = createNonSecureContextUuid()
  }
  const fallbackStartupOpt = buildWorktreeCreationStartupOpt(request, backendSpawned)
  const structuredLaunch = request.agentLaunchRoute === 'structured-native-chat'
  const startupOpt = structuredLaunch ? undefined : fallbackStartupOpt
  const worktree = result.worktree
  if (worktree.path && !structuredLaunch) {
    const repoConnectionId =
      useAppStore.getState().repos.find((repo) => repo.id === worktree.repoId)?.connectionId ?? null
    await preflightAgentTrust({
      agent: request.agent,
      workspacePath: worktree.path,
      connectionId: repoConnectionId
    })
  }
  return stopWorktreeCreationForChangedHost(creationId, request)
    ? null
    : { backendSpawned, fallbackStartupOpt, startupOpt }
}

export function getWorktreeCreationIndeterminate(request: WorktreeCreationRequest): boolean {
  if (request.worktreeCreateProgressMode) {
    return request.worktreeCreateProgressMode === 'indeterminate'
  }
  return getActiveRuntimeTarget(useAppStore.getState().settings).kind !== 'local'
}

export function getInitialWorktreeCreationPhase(
  request: WorktreeCreationRequest
): WorktreeCreationPhase {
  return request.ephemeralVmRecipe && !request.ephemeralVmRuntimeId ? 'provisioning-vm' : 'fetching'
}
