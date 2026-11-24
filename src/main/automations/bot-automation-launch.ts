import type {
  AgentJournalMessageItem,
  AgentJournalRenderItem
} from '../../shared/agent-session-journal-types'
import { readAgentJournalTurn } from '../../shared/agent-session-turn-record'
import { combineAutomationRunPrompt } from '../../shared/automation-run-prompt'
import type {
  Automation,
  AutomationRun,
  AutomationRunOutputSnapshot
} from '../../shared/automations-types'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { botLaunchSeedOptions } from '../../shared/bots/bot-launch'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  mintAgentSessionOperationId,
  structuredPointerPayloadFingerprint
} from '../runtime/orchestration/structured-pointer-operation-id'
import { createStructuredAgentSessionForWorktree } from '../runtime/rpc/methods/structured-agent-session-create'
import { createHeadlessAutomationOutputSnapshotBuffer } from './headless-dispatch'

type BotAutomationCompletion =
  | { status: 'completed'; outputSnapshot: AutomationRunOutputSnapshot | null }
  | { status: 'dispatch_failed'; error: string }
  | { status: 'dispatch_unknown'; error: string }

type BotAutomationLaunch = (args: {
  automation: Automation
  run: AutomationRun
  oneShotPrompt?: string
  operationId: string
}) => Promise<{
  sessionId: string
  workspaceId: string
  workspaceDisplayName: string
  completion: Promise<BotAutomationCompletion>
}>

export type BotAutomationLauncher = {
  launch: BotAutomationLaunch
  recover: (run: AutomationRun) => Promise<BotAutomationCompletion>
}

export function createBotAutomationLauncher(runtime: OrcaRuntimeService): BotAutomationLauncher {
  const launch: BotAutomationLaunch = async ({ automation, run, oneShotPrompt, operationId }) => {
    runtime.bots.assertEnabled()
    const target = automation.bot
    const bot = runtime.bots.list().find((entry) => entry.id === target?.botId)
    if (
      !bot ||
      bot.paused ||
      !target ||
      target.runsIn !== 'new' ||
      target.resultsTo !== 'none' ||
      target.chat
    ) {
      throw new Error('The Bot is unavailable for this automation.')
    }
    if (bot.permissionMode || (bot.agent !== 'claude' && bot.agent !== 'codex')) {
      throw new Error('This host cannot run the saved Bot agent configuration in Chat.')
    }
    const workspaceId = folderWorkspaceKey(bot.folderWorkspaceId)
    const sessionId = run.id
    const host = await requireBotAutomationHost(runtime)
    const opened = await createStructuredAgentSessionForWorktree({
      runtime,
      ensureHost: async () => host,
      caller: { callerKey: `trusted-local:bot-automation:${automation.id}` },
      envelope: {
        sessionId,
        clientOperationId: mintAgentSessionOperationId(Date.now()),
        expectedRuntimeFence: null,
        payloadFingerprint: ''
      },
      worktree: `id:${workspaceId}`,
      agent: bot.agent,
      options: botLaunchSeedOptions(bot.launch),
      activate: false
    })
    if (!opened.ok) {
      throw new Error(opened.refusal.message)
    }
    const holderId = `bot:automation:${run.id}`
    await host.hold(sessionId, holderId)
    try {
      const runtimeFence = host.deps.store.getRecord(sessionId)?.lease.runtimeFence
      if (runtimeFence === undefined) {
        throw new Error('The Bot Chat has no live session.')
      }
      const body: AgentJournalMessageItem = {
        kind: 'message',
        role: 'user',
        blocks: [
          { type: 'text', text: combineAutomationRunPrompt(automation.prompt, oneShotPrompt) }
        ]
      }
      const sent = await host.send(
        { callerKey: `trusted-local:bot-automation:${automation.id}` },
        {
          envelope: {
            sessionId,
            clientOperationId: operationId,
            expectedRuntimeFence: runtimeFence,
            payloadFingerprint: structuredPointerPayloadFingerprint(sessionId, body)
          },
          body
        }
      )
      if (!sent.ok) {
        host.release(sessionId, holderId)
        return {
          sessionId,
          workspaceId,
          workspaceDisplayName: bot.name,
          completion: Promise.resolve(unknownBotRun(sent.refusal.message))
        }
      }
      const initial = sent.value.submission
      const settled =
        initial.dispatchState === 'pending'
          ? await host.waitForSendSettlement(sessionId, sent.value.clientMessageId)
          : undefined
      const submitted = settled?.value.submission ?? initial
      if (submitted.dispatchState !== 'accepted' || !submitted.providerItemId) {
        host.release(sessionId, holderId)
        return {
          sessionId,
          workspaceId,
          workspaceDisplayName: bot.name,
          completion: Promise.resolve(
            submitted.dispatchState === 'rejected'
              ? {
                  status: 'dispatch_failed',
                  error: submitted.reason ?? 'The Bot refused the scheduled prompt.'
                }
              : unknownBotRun()
          )
        }
      }
      const completion = watchBotAutomationTurn(
        host,
        sessionId,
        submitted.providerItemId,
        run.id
      ).finally(() => host.release(sessionId, holderId))
      return {
        sessionId,
        workspaceId,
        workspaceDisplayName: bot.name,
        completion
      }
    } catch (error) {
      host.release(sessionId, holderId)
      throw error
    }
  }
  return {
    launch,
    async recover(run) {
      if (!run.chatSessionId || !run.chatOperationId) {
        return unknownBotRun()
      }
      const host = await requireBotAutomationHost(runtime)
      await host.restoreReadableSessions([run.chatSessionId])
      if (!host.hasSession(run.chatSessionId)) {
        return unknownBotRun()
      }
      const snapshot = host.journalSnapshot(run.chatSessionId)
      const submit = snapshot.submissions.find(
        (item) => item.clientMessageId === run.chatOperationId
      )
      if (submit?.dispatchState === 'rejected') {
        return {
          status: 'dispatch_failed',
          error: submit.reason ?? 'The Bot refused the scheduled prompt.'
        }
      }
      const itemId = submit?.dispatchState === 'accepted' ? submit.providerItemId : null
      return (itemId && botAutomationOutcome(snapshot.items, itemId)) || unknownBotRun()
    }
  }
}

async function requireBotAutomationHost(
  runtime: OrcaRuntimeService
): Promise<StructuredAgentSessionHost> {
  await runtime.ensureStructuredAgentSessionHost()
  const host = getStructuredAgentSessionHost()
  if (!host) {
    throw new Error('The Bot Chat host could not be opened.')
  }
  return host
}

function unknownBotRun(
  error = 'The run outcome could not be confirmed. Open the original Chat to see what was recorded.'
): BotAutomationCompletion {
  return {
    status: 'dispatch_unknown',
    error
  }
}

function botAutomationOutcome(
  items: readonly AgentJournalRenderItem[],
  providerItemId: string
): BotAutomationCompletion | undefined {
  const turn = items
    .map((item) => readAgentJournalTurn(item.body))
    .find((item) => item?.userItemId === providerItemId)
  if (!turn || turn.state === 'running') {
    return undefined
  }
  if (turn.state === 'unverifiable') {
    return unknownBotRun()
  }
  if (turn.state !== 'completed') {
    return { status: 'dispatch_failed', error: 'The scheduled Bot turn did not finish.' }
  }
  const user = items.find((item) => item.itemId === providerItemId)
  const output = createHeadlessAutomationOutputSnapshotBuffer()
  for (const item of items) {
    // Claude can acknowledge a submission without appending a separate user echo.
    const afterPrompt = user
      ? item.sequence > user.sequence
      : turn.startedAt !== undefined && item.observedAt >= turn.startedAt
    if (!afterPrompt || (turn.completedAt !== undefined && item.observedAt > turn.completedAt)) {
      continue
    }
    if (item.body.kind !== 'message') {
      continue
    }
    if (item.body.role === 'user') {
      break
    }
    if (item.body.role === 'assistant') {
      for (const block of item.body.blocks) {
        if (block.type === 'text') {
          output.append(`${block.text}\n`)
        }
      }
    }
  }
  return { status: 'completed', outputSnapshot: output.snapshot() }
}

const BOT_AUTOMATION_OBSERVATION_TIMEOUT_MS = 30 * 60 * 1000

function watchBotAutomationTurn(
  host: StructuredAgentSessionHost,
  sessionId: string,
  providerItemId: string,
  runId: string
): Promise<BotAutomationCompletion> {
  return new Promise((resolve, reject) => {
    const finish = (result: BotAutomationCompletion) => {
      clearTimeout(timer)
      unsubscribe()
      resolve(result)
    }
    const check = () => {
      try {
        const { items } = host.journalSnapshot(sessionId)
        const result = botAutomationOutcome(items, providerItemId)
        if (result) {
          finish(result)
        }
      } catch (error) {
        clearTimeout(timer)
        unsubscribe()
        reject(error)
      }
    }
    const timer = setTimeout(() => {
      finish(unknownBotRun())
    }, BOT_AUTOMATION_OBSERVATION_TIMEOUT_MS)
    timer.unref()
    const unsubscribe = host.subscribe({
      id: `bot:automation:${runId}`,
      sessionId,
      emit: () => queueMicrotask(check)
    })
    check()
  })
}
