import { hostname, userInfo } from 'node:os'
import { PullRequest } from '../../../../shared/rpc-contract/github-pull-request-params'
import { defineMethod } from '../core'
import {
  hasReviewProject,
  ReviewRepoSchema,
  ReviewRequestSchema
} from '../../../../shared/workbench/pr-review-request'
import { readReviewInbox, receiveReviewRequest } from '../../../workbench/review-inbox'

export const WORKBENCH_REVIEW_NOTIFICATION_METHODS = [
  defineMethod({
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
  defineMethod({
    name: 'workbench.review.identity',
    params: null,
    handler: () => ({ sender: `${userInfo().username}@${hostname()}`.slice(0, 100) })
  }),
  defineMethod({
    name: 'workbench.review.project',
    params: ReviewRepoSchema,
    handler: (repo, { runtime }) => ({ available: hasReviewProject(runtime.listRepos(), repo) })
  }),
  defineMethod({
    name: 'workbench.review.receive',
    params: ReviewRequestSchema,
    handler: async (request, { runtime, pairedDeviceId, authenticatedCallerFingerprint }) => {
      if (!hasReviewProject(runtime.listRepos(), request.repo)) {
        throw new Error('此主机没有接入该项目')
      }
      await receiveReviewRequest({
        ...request,
        senderId: pairedDeviceId ?? authenticatedCallerFingerprint ?? 'local',
        receivedAt: new Date().toISOString()
      })
      return { accepted: true }
    }
  }),
  defineMethod({
    name: 'workbench.review.inbox',
    params: null,
    handler: () => readReviewInbox()
  })
]
