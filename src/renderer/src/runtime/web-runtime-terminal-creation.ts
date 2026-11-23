import type { TuiAgent } from '../../../shared/tui-agent'
import {
  deliverLaunchPromptToAgentTab,
  seedNativeChatLaunchDraftForAgentTab
} from '../lib/agent-launch-prompt-delivery'
import { createWebRuntimeSessionTerminalResult } from './web-runtime-terminal-create-operation'
import { toWebTerminalSurfaceTabId } from './web-terminal-surface-id'
import type {
  CreateWebRuntimeSessionTerminalArgs,
  CreatedWebRuntimeSessionTerminal,
  WebRuntimeTerminalCreateOutcome
} from './web-runtime-session-types'

export async function createWebRuntimeSessionTerminal(
  args: CreateWebRuntimeSessionTerminalArgs
): Promise<WebRuntimeTerminalCreateOutcome> {
  return (await createWebRuntimeSessionTerminalResult(args)).outcome
}

/** Deliver only after the selected create route has settled its startup recipe. */
export async function deliverCreatedWebRuntimeAgentSessionPrompt(
  created: CreatedWebRuntimeSessionTerminal,
  args: {
    agent: TuiAgent
    promptAfterReady?: string
    submitPrompt?: boolean
    forcePromptPaste?: boolean
    launchDraft?: string
  }
): Promise<boolean> {
  if (created.outcome.status === 'failed') {
    return false
  }
  if (args.promptAfterReady !== undefined) {
    if (!created.hostTabId) {
      return false
    }
    return await deliverLaunchPromptToAgentTab({
      tabId: toWebTerminalSurfaceTabId(created.hostTabId),
      content: args.promptAfterReady,
      agent: args.agent,
      submit: args.submitPrompt === true,
      forcePaste: args.forcePromptPaste === true
    }).catch(() => false)
  }
  if (args.launchDraft !== undefined && created.hostTabId) {
    seedNativeChatLaunchDraftForAgentTab({
      tabId: toWebTerminalSurfaceTabId(created.hostTabId),
      agent: args.agent,
      text: args.launchDraft
    })
  }
  return true
}
