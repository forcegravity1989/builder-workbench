import { join } from 'node:path'
import {
  addBotMemoryFact,
  botMemoryChange,
  botMemoryDate,
  editBotMemoryFact,
  parseBotMemoryFacts
} from '../../../../shared/bot-memory-lines'
import {
  BotChat,
  BotMemoryEdit,
  BotMemoryForget
} from '../../../../shared/rpc-contract/bots-params'
import { botHomeFolder, localBotHomeFilesystem } from '../../../bots/bot-home'
import { defineMethod, InvalidArgumentError, type RpcContext } from '../core'

export function requireBotOwner(context: RpcContext): void {
  if (
    context.clientId !== 'desktop-renderer' &&
    (context.pairedDeviceId === undefined || context.accessMode !== 'full')
  ) {
    throw new Error('Manage Bots from the desktop or an authorized paired host.')
  }
}

function ownerBotHome(context: RpcContext, botId: string | undefined): string {
  requireBotOwner(context)
  context.runtime.bots.assertEnabled()
  const bot = context.runtime.bots.list().find((entry) => entry.id === botId)
  if (!bot) {
    throw new Error('bot_not_found')
  }
  return botHomeFolder(bot)
}

export const BOT_MEMORY_METHODS = [
  defineMethod({
    name: 'bots.memory.list',
    params: BotChat,
    handler: async ({ botId }, context) => {
      const folder = ownerBotHome(context, botId)
      const text = await localBotHomeFilesystem.readText(join(folder, 'MEMORY.md'))
      if (text === null) {
        throw new Error('Could not read MEMORY.md.')
      }
      return { facts: parseBotMemoryFacts(text).map((fact) => fact.text) }
    }
  }),
  defineMethod({
    name: 'bots.memory.edit',
    params: BotMemoryEdit,
    handler: async (params, context) => {
      const folder = ownerBotHome(context, params.botId)
      await context.runtime.bots.memory.change(params.botId, folder, { kind: 'owner' }, (file) => {
        if (params.fact === undefined) {
          return botMemoryChange(
            file,
            addBotMemoryFact(file, params.text, botMemoryDate(new Date()))
          )
        }
        const fact = parseBotMemoryFacts(file).find((entry) => entry.text === params.fact)
        if (!fact) {
          throw new InvalidArgumentError('That memory changed meanwhile. Open it again to edit it.')
        }
        return botMemoryChange(file, editBotMemoryFact(file, fact, params.text))
      })
      return {}
    }
  }),
  defineMethod({
    name: 'bots.memory.forget',
    params: BotMemoryForget,
    handler: async (params, context) => {
      const folder = ownerBotHome(context, params.botId)
      return {
        forgot: await context.runtime.bots.memory.forget(params.botId!, folder, params.fact, {
          kind: 'owner'
        })
      }
    }
  })
]
