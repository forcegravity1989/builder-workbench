import { hostname, userInfo } from 'node:os'
import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  PrototypeReviewDismissSchema,
  PrototypeReviewRequestSchema
} from '../../../../shared/workbench/prototype-review-request'
import {
  dismissPrototypeReviewRequest,
  readPrototypeReviewInbox,
  receivePrototypeReviewRequest
} from '../../../workbench/prototype-review-inbox'

export const WORKBENCH_PROTOTYPE_REVIEW_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.identity',
    params: null,
    handler: () => ({ sender: `${userInfo().username}@${hostname()}`.slice(0, 100) })
  }),
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.receive',
    params: PrototypeReviewRequestSchema,
    handler: async (request, { pairedDeviceId, authenticatedCallerFingerprint }) => {
      const accepted = await receivePrototypeReviewRequest({
        ...request,
        senderId: pairedDeviceId ?? authenticatedCallerFingerprint ?? request.sender,
        receivedAt: new Date().toISOString()
      })
      return { accepted }
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.inbox',
    params: null,
    handler: () => readPrototypeReviewInbox()
  }),
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.dismiss',
    params: PrototypeReviewDismissSchema,
    handler: async ({ eventId, seenReceivedAt }) => ({
      dismissed: await dismissPrototypeReviewRequest(eventId, seenReceivedAt)
    })
  })
]
