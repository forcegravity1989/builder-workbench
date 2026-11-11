import { hostname, userInfo } from 'node:os'
import { PullRequest } from '../../../../shared/rpc-contract/github-pull-request-params'
import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { ReviewRequestSchema } from '../../../../shared/workbench/pr-review-request'
import { readReviewInbox, receiveReviewRequest } from '../../../workbench/review-inbox'

export const WORKBENCH_REVIEW_NOTIFICATION_METHODS = [
  defineWorkbenchMethod({
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
  defineWorkbenchMethod({
    name: 'workbench.review.identity',
    params: null,
    handler: () => ({ sender: `${userInfo().username}@${hostname()}`.slice(0, 100) })
  }),
  defineWorkbenchMethod({
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
  defineWorkbenchMethod({
    name: 'workbench.review.inbox',
    params: null,
    handler: () => readReviewInbox()
  })
]
