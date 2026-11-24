import { openBotHomeChat } from '../../../bots/bot-chat-session'
import { BotChat, BotCreate, BotUpdate } from '../../../../shared/rpc-contract/bots-params'
import { defineMethod } from '../core'
import { BOT_MEMORY_METHODS, requireBotOwner } from './bots-memory'
import { isStructuredNativeChatEnabled } from './structured-agent-session-policy'

export const BOT_METHODS = [
  defineMethod({
    name: 'bots.list',
    params: null,
    handler: (_params, context) => {
      requireBotOwner(context)
      return {
        ...context.runtime.bots.listing(),
        chatEnabled: isStructuredNativeChatEnabled(context.runtime)
      }
    }
  }),
  defineMethod({
    name: 'bots.create',
    params: BotCreate,
    handler: async (params, context) => {
      requireBotOwner(context)
      const controller = context.runtime.bots
      controller.assertEnabled()
      if (!isStructuredNativeChatEnabled(context.runtime)) {
        throw new Error('Enable structured Chat on this host before creating a Bot.')
      }
      if (params.fromShare || params.fromTemplate || params.takingOver || params.handOff) {
        throw new Error('The selected Bot creation source is unavailable on this host.')
      }
      if (params.permissionMode) {
        throw new Error('This host uses the native Chat permission settings for Bots.')
      }
      if (params.fromOffer) {
        const created = await controller.createFromOffer({ ...params, fromOffer: params.fromOffer })
        if (!created.bot) {
          throw new Error('The Bot created from this offer was deleted.')
        }
        return { bot: created.bot }
      }
      return { bot: await controller.create(params) }
    }
  }),
  defineMethod({
    name: 'bots.update',
    params: BotUpdate,
    handler: async (params, context) => {
      requireBotOwner(context)
      if (params.updates.permissionMode) {
        throw new Error('This host uses the native Chat permission settings for Bots.')
      }
      return { bot: await context.runtime.bots.update(params.botId, params.updates) }
    }
  }),
  defineMethod({
    name: 'bots.chat.open',
    params: BotChat,
    handler: async ({ botId }, context) => {
      requireBotOwner(context)
      return { sessionId: await openBotHomeChat(context.runtime, botId) }
    }
  }),
  ...BOT_MEMORY_METHODS
]
