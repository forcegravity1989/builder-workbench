import { isWorkbenchProduct } from '../../../startup/workbench-product'
// Receiving a bot by link: its review, or a copy's original. Making the bot is `bots.create` with
// `fromShare`.
import { BotShareReviewParams } from '../../../../shared/rpc-contract/bots-share-params'
import { defineMethod, InvalidArgumentError } from '../core'
import { assertTrustedCaller } from './bots-share'

export const BOT_SHARE_RECEIVE_METHODS = [
  defineMethod({
    name: 'bots.share.review',
    permission: 'workspace',
    params: BotShareReviewParams,
    handler: async ({ shareId, versionId }, context) => {
      assertTrustedCaller(context)
      if (isWorkbenchProduct()) {
        throw new InvalidArgumentError('Orca Bot links are unavailable in Monica.')
      }
      return { review: await context.runtime.botShares().review(shareId, versionId) }
    }
  })
]
