import type { ActivateAndRevealResult } from '@/lib/worktree-activation'
import { toast } from 'sonner'
import { assertHostAgentStartupOwner } from '@/lib/host-agent-startup-inputs'
import type { AgentLaunchSettingsOwner } from '@/runtime/agent-launch-settings/agent-launch-settings-transport'

type FullCreationCompletion = {
  setSidebarOpen: (open: boolean) => void
  persistDraft: boolean
  clearNewWorkspaceDraft: () => void
  onCreated?: () => void
}

export function stopFullCreationForChangedHost(
  owner: AgentLaunchSettingsOwner | undefined,
  completion: FullCreationCompletion
): boolean {
  try {
    assertHostAgentStartupOwner(owner)
    return false
  } catch (error) {
    // The workspace exists; close creation without retrying or starting on a replacement runtime.
    toast.error(error instanceof Error ? error.message : String(error))
    closeFullCreation(completion)
    return true
  }
}

function closeFullCreation(args: FullCreationCompletion): void {
  args.setSidebarOpen(true)
  if (args.persistDraft) {
    args.clearNewWorkspaceDraft()
  }
  args.onCreated?.()
}

type FullCreationFinalizationArgs = FullCreationCompletion & {
  structuredLaunchAccepted: boolean
  worktreeId: string
  activation: ActivateAndRevealResult | false
  queueWorkspaceActivationTerminalFocus: (
    worktreeId: string,
    activation: ActivateAndRevealResult | false
  ) => void
}

export function finalizeFullCreation(args: FullCreationFinalizationArgs): void {
  closeFullCreation(args)
  if (!args.structuredLaunchAccepted) {
    args.queueWorkspaceActivationTerminalFocus(args.worktreeId, args.activation)
  }
}
