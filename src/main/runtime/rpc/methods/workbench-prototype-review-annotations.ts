import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import {
  PrototypeReviewAnnotationAddSchema,
  PrototypeReviewAnnotationDeleteSchema,
  PrototypeReviewAnnotationListSchema
} from '../../../../shared/workbench/prototype-review-annotation'
import {
  addPrototypeReviewAnnotation,
  deletePrototypeReviewAnnotation,
  readPrototypeReviewAnnotations
} from '../../../workbench/prototype-review-annotations'

export const WORKBENCH_PROTOTYPE_REVIEW_ANNOTATION_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.annotations.list',
    params: PrototypeReviewAnnotationListSchema,
    handler: ({ documentKey }) => readPrototypeReviewAnnotations(documentKey)
  }),
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.annotations.add',
    params: PrototypeReviewAnnotationAddSchema,
    handler: (
      { id, documentKey, comment, intent, priority, payload, hostName, author },
      { authenticatedCallerFingerprint, pairedDeviceId, pairedDeviceName }
    ) =>
      addPrototypeReviewAnnotation({
        id,
        documentKey,
        comment,
        intent,
        priority,
        payload,
        // Why: a remote member is named by what the host recorded for them and cannot claim another
        // name; only the host's own app may keep the original author when it edits a pulled note.
        author: (pairedDeviceId || authenticatedCallerFingerprint
          ? (pairedDeviceName ?? pairedDeviceId ?? authenticatedCallerFingerprint ?? 'local')
          : (author ?? 'local')
        ).slice(0, 100),
        host: hostName ?? (pairedDeviceId ? '共享主机' : '当前主机'),
        createdAt: new Date().toISOString()
      })
  }),
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.annotations.delete',
    params: PrototypeReviewAnnotationDeleteSchema,
    handler: async ({ documentKey, annotationId }) => ({
      deleted: await deletePrototypeReviewAnnotation(documentKey, annotationId)
    })
  })
]
