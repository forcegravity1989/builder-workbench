import { randomUUID } from 'node:crypto'
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
    handler: async ({ worktree, page, documentKey }, { runtime }) => {
      // Resolve the page through the runtime before returning state so a stale notification cannot
      // read annotations for a page that no longer exists.
      await runtime.browserTabShow({ worktree, page })
      return readPrototypeReviewAnnotations(page, documentKey)
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.annotations.add',
    params: PrototypeReviewAnnotationAddSchema,
    handler: async (
      { id, worktree, page, documentKey, comment, x, y, label, hostName },
      { runtime, authenticatedCallerFingerprint, pairedDeviceId, pairedDeviceName }
    ) => {
      await runtime.browserTabShow({ worktree, page })
      return addPrototypeReviewAnnotation({
        id: id ?? randomUUID(),
        pageId: page,
        documentKey,
        comment,
        x,
        y,
        ...(label ? { label } : {}),
        // Why: annotations are shown by whoever wrote them, so a remote reviewer is named by the
        // member the host recorded, not by the host's own name or an opaque device id.
        author: (
          pairedDeviceName ??
          pairedDeviceId ??
          authenticatedCallerFingerprint ??
          'local'
        ).slice(0, 100),
        host: hostName ?? (pairedDeviceId ? '共享主机' : '当前主机'),
        createdAt: new Date().toISOString()
      })
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.prototypeReview.annotations.delete',
    params: PrototypeReviewAnnotationDeleteSchema,
    handler: async ({ pageId, documentKey, annotationId }) => ({
      deleted: await deletePrototypeReviewAnnotation(pageId, documentKey, annotationId)
    })
  })
]
