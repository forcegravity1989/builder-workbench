import type { Bot, BotAgent } from '../../../../shared/bot-types'
import { ownBotHost } from '@/lib/bot-hosts'
import { openBotHomeTab, refreshBotHost } from '@/lib/bot-catalog'
import { stampBotHost } from '@/lib/bot-catalog-snapshot'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'

export async function openMonicaSupport(agent?: BotAgent): Promise<string | undefined> {
  const { hostId, target } = ownBotHost()
  const { bot, skillWarning } = await callRuntimeRpc<{ bot: Bot; skillWarning?: string }>(
    target,
    'workbench.support.open',
    { agent },
    { timeoutMs: 120_000 }
  )
  await refreshBotHost(hostId)
  const opened = await openBotHomeTab(stampBotHost(hostId, bot), { requireChat: true })
  if (!opened) {
    throw new Error('Could not open the Monica conversation. Try again from Help.')
  }
  return skillWarning
}
