// Sharing a bot by link: build the candidate, publish it, move or stop the bot's one link.
import type { Bot } from '../../../../shared/bot-types'
import {
  SharingUnavailableOnHostError,
  WORKBENCH_PUBLISHING_UNAVAILABLE_MESSAGE
} from '../../../../shared/remote-runtime/host-status/sharing-unavailable-on-host'
import { isWorkbenchProduct } from '../../../startup/workbench-product'
import {
  BotSharePartView,
  BotSharePublish,
  BotSharePrepare,
  BotShareStatusParams,
  BotShareStop
} from '../../../../shared/rpc-contract/bots-share-params'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { defineMethod, InvalidArgumentError, type RpcContext } from '../core'

export const BOT_SHARE_UNKNOWN_CALLER = 'Share a bot from Orca or its `orca` CLI.'

/** Anyone who can reach the bot through Orca (a window, a paired device, or an agent's `orca` CLI,
 *  here or over a pairing) can already read and paste its files, so all of them may share; only a
 *  client with no proven identity is refused. */
export function assertTrustedCaller(context: RpcContext): void {
  context.runtime.bots.assertEnabled()
  assertIdentifiedCaller(context)
}

function assertIdentifiedCaller(context: RpcContext): void {
  if (!context.caller) {
    throw new InvalidArgumentError(BOT_SHARE_UNKNOWN_CALLER)
  }
}

function assertLegacyShareManagementAllowed(context: RpcContext): void {
  if (isWorkbenchProduct()) {
    // Existing cloud links can outlive the local Bots feature and its bot records.
    assertIdentifiedCaller(context)
    return
  }
  assertTrustedCaller(context)
}

function assertPublishingAllowed(context: RpcContext): void {
  if (isWorkbenchProduct()) {
    throw new SharingUnavailableOnHostError(WORKBENCH_PUBLISHING_UNAVAILABLE_MESSAGE, [])
  }
  assertTrustedCaller(context)
}

function authorizedBot(context: RpcContext, botId: string): Bot {
  assertPublishingAllowed(context)
  return botOf(context.runtime, botId)
}

function botOf(runtime: OrcaRuntimeService, botId: string): Bot {
  const bot = runtime.bots.list().find((entry) => entry.id === botId)
  if (!bot) {
    throw new InvalidArgumentError('No such bot.')
  }
  return bot
}

export const BOT_SHARE_METHODS = [
  defineMethod({
    name: 'bots.share.prepare',
    permission: 'workspace',
    params: BotSharePrepare,
    handler: async (
      { botId, setupNote, last, localOnly, skillsSession, reuseSkills, ...selection },
      context
    ) =>
      context.runtime.botShares().prepare(authorizedBot(context, botId), selection, {
        setupNote,
        last,
        localOnly,
        session: skillsSession,
        reuseSkills
      })
  }),
  defineMethod({
    name: 'bots.share.publish',
    permission: 'workspace',
    params: BotSharePublish,
    handler: async ({ botId, candidateId, setupNote = '', link }, context) => {
      const bot = authorizedBot(context, botId)
      const shares = context.runtime.botShares()
      return link
        ? shares.update(bot, candidateId, setupNote, link)
        : shares.publish(bot, candidateId, setupNote)
    }
  }),
  defineMethod({
    name: 'bots.share.view',
    permission: 'workspace',
    params: BotSharePartView,
    handler: async ({ botId, candidateId, part }, context) => ({
      files: await context.runtime
        .botShares()
        .view(authorizedBot(context, botId), candidateId, part)
    })
  }),
  defineMethod({
    name: 'bots.share.stop',
    permission: 'workspace',
    params: BotShareStop,
    handler: async ({ shareId, botId }, context) => {
      assertLegacyShareManagementAllowed(context)
      return context.runtime.botShares().stop(shareId, botId)
    }
  }),
  defineMethod({
    name: 'bots.share.status',
    permission: 'workspace',
    params: BotShareStatusParams,
    // Every live bot link the owner has; botShareStatusOf reads one bot's from it.
    handler: async ({ botId }, context) => {
      assertLegacyShareManagementAllowed(context)
      return context.runtime.botShares().list(context.runtime.bots.list(), botId)
    }
  })
]
