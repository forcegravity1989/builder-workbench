import { randomUUID } from 'node:crypto'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { botLaunchSeedOptions } from '../../shared/bots/bot-launch'
import type { Bot } from '../../shared/bot-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { mintAgentSessionOperationId } from '../runtime/orchestration/structured-pointer-operation-id'
import { latestOrchestrationSession } from '../runtime/orchestration/session-lineage'
import { createStructuredAgentSessionForWorktree } from '../runtime/rpc/methods/structured-agent-session-create'
import { closeStructuredAgentSessionChild } from '../runtime/structured-agent-session-close'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'

/** Serialize Home Chat acquisition across desktop and paired clients. */
const opening = new Map<string, Promise<string>>()

export function openBotHomeChat(runtime: OrcaRuntimeService, botId: string): Promise<string> {
  const pending = opening.get(botId)
  if (pending) {
    return pending
  }
  const acquired = acquireBotHomeChat(runtime, botId).finally(() => opening.delete(botId))
  opening.set(botId, acquired)
  return acquired
}

async function acquireBotHomeChat(runtime: OrcaRuntimeService, botId: string): Promise<string> {
  runtime.bots.assertEnabled()
  const bot = runtime.bots.list().find((entry) => entry.id === botId)
  if (!bot) {
    throw new Error('bot_not_found')
  }
  if (bot.permissionMode) {
    throw new Error('This host cannot apply the permission mode saved for this Bot.')
  }
  const workspaceId = folderWorkspaceKey(bot.folderWorkspaceId)
  const agent = await requireBotChatAgent(runtime, bot, workspaceId)
  await runtime.ensureStructuredAgentSessionHost()
  const host = getStructuredAgentSessionHost()
  if (!host) {
    throw new Error('structured_agent_session_unsupported')
  }

  const root = bot.chatSessionId ? host.deps.store.getRecord(bot.chatSessionId) : null
  const existing = root
    ? latestOrchestrationSession(root, (id) => host.deps.store.getRecord(id))
    : null
  if (existing) {
    if (existing.location.workspaceId !== workspaceId) {
      throw new Error('bot_chat_workspace_mismatch')
    }
    if (existing.provider === agent) {
      const holderId = `bot:open:${botId}`
      await host.hold(existing.sessionId, holderId)
      try {
        await runtime.publishStructuredAgentSessionTab({
          workspaceId,
          sessionId: existing.sessionId,
          agent,
          activate: true
        })
      } finally {
        host.release(existing.sessionId, holderId)
      }
      return existing.sessionId
    }
    const closed = await closeStructuredAgentSessionChild(existing.sessionId, { runtime })
    if (!closed.stopped) {
      throw new Error(closed.reason ?? 'The previous Bot Chat could not be stopped.')
    }
  }

  // Reserve the chosen ID before attaching. On a retry, an attach whose result was lost still
  // resolves to the same Home Chat instead of adding another one.
  const sessionId = !existing && bot.chatSessionId ? bot.chatSessionId : randomUUID()
  if (sessionId !== bot.chatSessionId) {
    await runtime.bots.setChatSession(botId, sessionId)
  }
  const opened = await createStructuredAgentSessionForWorktree({
    runtime,
    ensureHost: async () => host,
    caller: { callerKey: 'trusted-local:runtime' },
    envelope: {
      sessionId,
      clientOperationId: mintAgentSessionOperationId(Date.now()),
      expectedRuntimeFence: null,
      payloadFingerprint: ''
    },
    worktree: `id:${workspaceId}`,
    agent,
    options: botLaunchSeedOptions(bot.launch),
    activate: true
  })
  if (!opened.ok) {
    throw new Error(opened.refusal.message)
  }
  return opened.value.sessionId
}

async function requireBotChatAgent(
  runtime: OrcaRuntimeService,
  bot: Pick<Bot, 'agent'>,
  workspaceId: string
): Promise<'claude' | 'codex'> {
  const { agent } = bot
  if (agent !== 'claude' && agent !== 'codex') {
    throw new Error('This host cannot open a native Chat for the selected Agent.')
  }
  const support = await runtime.getStructuredAgentSessionCreateSupport(`id:${workspaceId}`, agent)
  if (!support.supported) {
    throw new Error('Enable structured Chat on this host and select an available Agent.')
  }
  return agent
}
