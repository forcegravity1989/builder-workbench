import { hostname, userInfo } from 'node:os'
import { PullRequest } from '../../../../shared/rpc-contract/github-pull-request-params'
import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import {
  ReviewDismissSchema,
  ReviewRequestSchema
} from '../../../../shared/monica/pr-review-request'
import {
  dismissReviewRequest,
  readReviewInbox,
  receiveReviewRequest
} from '../../../monica/review-inbox'

export const MONICA_REVIEW_NOTIFICATION_METHODS = [
  defineMonicaMethod({
    name: 'workbench.review.comments',
    params: PullRequest,
    handler: async (params, { runtime }) => ({
      complete: true,
      comments: await runtime.getRepoPRComments(
        params.repo,
        params.prNumber,
        params.prRepo ?? null,
        { noCache: true, requireCompleteThreads: true }
      )
    })
  }),
  defineMonicaMethod({
    name: 'workbench.review.identity',
    params: null,
    handler: () => ({ sender: `${userInfo().username}@${hostname()}`.slice(0, 100) })
  }),
  defineMonicaMethod({
    name: 'workbench.review.receive',
    params: ReviewRequestSchema,
    handler: async (request, { pairedDeviceId, authenticatedCallerFingerprint }) => {
      const accepted = await receiveReviewRequest({
        ...request,
        senderId: pairedDeviceId ?? authenticatedCallerFingerprint ?? 'local',
        receivedAt: new Date().toISOString()
      })
      return { accepted }
    }
  }),
  defineMonicaMethod({
    name: 'workbench.review.inbox',
    params: null,
    handler: () => readReviewInbox()
  }),
  defineMonicaMethod({
    name: 'workbench.review.dismiss',
    params: ReviewDismissSchema,
    handler: async ({ repo, prNumber, seenReceivedAt }) => ({
      dismissed: await dismissReviewRequest(repo, prNumber, seenReceivedAt)
    })
  })
]
