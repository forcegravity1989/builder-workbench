import { hostname, userInfo } from 'node:os'
import { getRemoteRuntimeCallerIdentity } from '../../../../shared/remote-runtime-caller-identity'
import { PullRequest } from '../../../../shared/rpc-contract/github/github-pull-request-params'
import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  ReviewDismissSchema,
  ReviewRequestSchema
} from '../../../../shared/workbench/pr-review-request'
import {
  dismissReviewRequest,
  readReviewInbox,
  receiveReviewRequest
} from '../../../workbench/review-inbox'

export const WORKBENCH_REVIEW_NOTIFICATION_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.review.comments',
    permission: 'workspace',
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
    permission: 'workspace',
    params: null,
    handler: () => ({
      sender: (
        getRemoteRuntimeCallerIdentity()?.name ?? `${userInfo().username}@${hostname()}`
      ).slice(0, 100)
    })
  }),
  defineWorkbenchMethod({
    name: 'workbench.review.receive',
    permission: 'workspace',
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
    permission: 'workspace',
    params: null,
    handler: () => readReviewInbox()
  }),
  defineWorkbenchMethod({
    name: 'workbench.review.dismiss',
    permission: 'workspace',
    params: ReviewDismissSchema,
    handler: async ({ repo, prNumber, seenReceivedAt }) => ({
      dismissed: await dismissReviewRequest(repo, prNumber, seenReceivedAt)
    })
  })
]
