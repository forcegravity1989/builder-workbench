import { join } from 'node:path'
import { assertBotOwnsHome, botHomeFolder, localBotHomeFilesystem } from '../../../bots/bot-home'
import { writeFileAtomically } from '../../../filesystem/atomic-file-publication'
import type { Bot, BotAgent } from '../../../../shared/bot-types'
import { LOOK_AROUND_DEFAULTS } from '../../../../shared/bots/bot-look-around'
import { MonicaSupportRequest } from '../../../../shared/workbench/monica-support'
import { botFirstKickoff } from '../../../../shared/bots/bot-import'
import { requireStructuredHost, runtimeBotChats } from '../../../bots/bot-chat-session'
import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { prepareWorkbenchSkill } from '../../../workbench/skill-install'
import type { RpcContext } from '../core'

const role = 'workbench-monica-support'
const opening = new WeakMap<RpcContext['runtime'], Promise<{ bot: Bot; skillWarning?: string }>>()

const greetingInFlight = new Set<string>()

async function greetIfNew(runtime: RpcContext['runtime'], bot: Bot): Promise<void> {
  if (!bot.firstRun || greetingInFlight.has(bot.id)) {
    return
  }
  greetingInFlight.add(bot.id)
  try {
    const chats = runtimeBotChats(runtime)
    const host = await requireStructuredHost(runtime)
    const sessionId = await chats.ensure(bot.id)
    const sends = await host.journalReads(sessionId).sendFingerprints()
    if (sends.length === 0) {
      await chats.sendToSession(bot.id, sessionId, botFirstKickoff(bot), undefined, 'bot-created')
    }
  } finally {
    greetingInFlight.delete(bot.id)
  }
}
async function openSupportBot(runtime: RpcContext['runtime'], agent?: BotAgent) {
  const existing = runtime.bots.list().find((bot) => bot.templateId === role)
  if (!existing && !agent) {
    throw new Error('Choose an available chat agent in Settings, then open Monica again.')
  }
  let skillPath: string | undefined
  let skillWarning: string | undefined
  try {
    const prepared = await prepareWorkbenchSkill(runtime, { topic: 'improve-workbench' })
    skillPath = prepared.skillPath
  } catch (error) {
    skillWarning = error instanceof Error ? error.message : String(error)
  }
  const created =
    existing ??
    (await runtime.bots.create(
      {
        name: 'Monica',
        agent,
        seed: {
          purpose: 'Help people use Monica (BW) and report product feedback from any project.',
          watches:
            'For product questions, read the installed CLI guide with skills get bw. Follow its references and guide the user one step at a time. Check which computer and product version the evidence comes from.',
          does: 'Handle product support here. Never dispatch a vague Monica bug to a business project. Reuse the conversation for feedback. Read the installed improve-workbench Skill and follow its confirmation and optional start-fix steps. If missing, keep the evidence and suggest reopening Ask Monica from Help to prepare it.',
          reports:
            'When collecting product feedback, read monica-feedback.json in your Home. Its skillPath points to the full installed guide. If unavailable, preserve the original request and explain how to retry.'
        }
      },
      { templateId: role }
    ))
  const bot = created.lookAround
    ? created
    : await runtime.bots.update(created.id, { lookAround: { ...LOOK_AROUND_DEFAULTS, on: false } })
  const home = botHomeFolder(bot)
  await assertBotOwnsHome(localBotHomeFilesystem, home, bot.id)
  writeFileAtomically(
    join(home, 'monica-feedback.json'),
    JSON.stringify({ skillPath: skillPath ?? null })
  )
  void greetIfNew(runtime, bot).catch((error: unknown) =>
    console.warn('[workbench] Monica greeting failed:', error)
  )
  return { bot, skillWarning }
}
export const MONICA_SUPPORT_METHOD = defineWorkbenchMethod({
  name: 'workbench.support.open',
  permission: 'skills-admin',
  params: MonicaSupportRequest,
  handler: async ({ agent }, { runtime, caller, clientId, pairedDeviceId }) => {
    if (
      caller?.kind !== 'desktop' ||
      clientId !== 'desktop-renderer' ||
      pairedDeviceId !== undefined
    ) {
      throw new Error('Open Monica from Help on this computer.')
    }
    runtime.bots.assertEnabled()
    let pending = opening.get(runtime)
    if (!pending) {
      pending = openSupportBot(runtime, agent).finally(() => opening.delete(runtime))
      opening.set(runtime, pending)
    }
    return pending
  }
})
