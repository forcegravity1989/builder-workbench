import { z } from 'zod'
import {
  migrateStoredReviewRequest,
  ReviewRequestSchema
} from '../../../../shared/workbench/pr-review-request'
import { EMPTY_REVIEW_NOTIFICATIONS, reviewNoteId, type ReviewNotificationsState } from './model'

const STORAGE_KEY = 'bw.pr-review-notifications.v1'
const StoredTarget = z.object({
  environmentId: z.string().min(1),
  name: z.string(),
  pairingRevision: z.number()
})
const StoredNote = z.preprocess(
  migrateStoredReviewRequest,
  ReviewRequestSchema.extend({
    deliveries: z.array(
      z.object({
        environmentId: z.string().min(1),
        name: z.string(),
        pairingRevision: z.number(),
        ok: z.boolean(),
        error: z.string().optional()
      })
    )
  })
)

export function readStoredReviewNotifications(): ReviewNotificationsState {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return EMPTY_REVIEW_NOTIFICATIONS
  }
  const parsed = z
    .object({
      outgoing: z.array(StoredNote),
      pending: z
        .array(
          z.object({
            request: z.preprocess(migrateStoredReviewRequest, ReviewRequestSchema),
            targets: z.array(StoredTarget)
          })
        )
        .default([])
    })
    .parse(JSON.parse(raw))
  return {
    incoming: [],
    pending: parsed.pending,
    outgoing: parsed.outgoing.map((note) => ({
      ...note,
      id: reviewNoteId(note.repo, note.prNumber),
      readback: null,
      readbackError: null
    }))
  }
}

export function writeStoredReviewNotifications(state: ReviewNotificationsState): void {
  // Provider readings are transient. A write failure must reach the caller, not masquerade as durable success.
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      pending: state.pending,
      outgoing: state.outgoing.map(
        ({ readback: _readback, readbackError: _error, id: _id, ...note }) => note
      )
    })
  )
}
