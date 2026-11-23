import { z } from 'zod'
import { PrototypeReviewRequestSchema } from '../../../../shared/workbench/prototype-review-request'
import {
  EMPTY_PROTOTYPE_REVIEW_STATE,
  prototypeReviewId,
  type PrototypeReviewState
} from './prototype-model'

const STORAGE_KEY = 'bw.prototype-review-notifications.v1'
const StoredTarget = z.object({
  environmentId: z.string().min(1),
  name: z.string(),
  pairingRevision: z.number()
})
const StoredNote = PrototypeReviewRequestSchema.extend({
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

export function readStoredPrototypeReviewNotifications(): PrototypeReviewState {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return EMPTY_PROTOTYPE_REVIEW_STATE
  }
  const parsed = z
    .object({
      outgoing: z.array(StoredNote),
      pending: z
        .array(
          z.object({
            request: PrototypeReviewRequestSchema,
            targets: z.array(StoredTarget)
          })
        )
        .default([])
    })
    .parse(JSON.parse(raw))
  return {
    incoming: [],
    pending: parsed.pending,
    outgoing: parsed.outgoing.map((note) => ({ ...note, id: prototypeReviewId(note) }))
  }
}

export function writeStoredPrototypeReviewNotifications(state: PrototypeReviewState): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      pending: state.pending,
      outgoing: state.outgoing.map(({ id: _id, ...note }) => note)
    })
  )
}
