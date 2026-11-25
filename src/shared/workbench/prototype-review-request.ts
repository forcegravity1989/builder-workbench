import { z } from 'zod'
import type { ReviewPeerTarget } from './pr-review-request'

/** The HTML document under review, addressed by its owner's host and worktree. */
export const PrototypeReviewPageRefSchema = z.object({
  sourceEnvironmentId: z.string().min(1),
  /** Stable runtime identity used to resolve a sender's local environment on another client. */
  sourceRuntimeId: z.string().min(1).optional(),
  sourceHostName: z.string().trim().min(1).max(200),
  worktreeId: z.string().min(1).max(500),
  /** Absolute file path on the owner's host; also the key of that document's annotations. */
  documentKey: z.string().min(1).max(2000),
  title: z.string().trim().min(1).max(500)
})
export type PrototypeReviewPageRef = z.infer<typeof PrototypeReviewPageRefSchema>

/** `invite`: the owner asks a member to review. `submitted`: a member hands notes back. */
export const PrototypeReviewPurposeSchema = z.enum(['invite', 'submitted'])
export type PrototypeReviewPurpose = z.infer<typeof PrototypeReviewPurposeSchema>

export const PrototypeReviewRequestSchema = z.object({
  event: z.literal('prototype-review'),
  purpose: PrototypeReviewPurposeSchema,
  /** Number of notes handed over; present for `submitted`. */
  annotationCount: z.number().int().min(0).max(1000).optional(),
  page: PrototypeReviewPageRefSchema,
  sender: z.string().trim().min(1).max(100),
  senderId: z.string().min(1).max(500).optional(),
  cycleId: z.string().uuid(),
  cycleStartedAt: z.string().datetime(),
  round: z.number().int().positive(),
  sentAt: z.string().datetime()
})
export type PrototypeReviewRequest = z.infer<typeof PrototypeReviewRequestSchema>

export const PrototypeReviewIncomingSchema = PrototypeReviewRequestSchema.extend({
  receivedAt: z.string().datetime(),
  senderId: z.string().min(1)
})
export type PrototypeReviewIncomingRequest = z.infer<typeof PrototypeReviewIncomingSchema>

export type PrototypeReviewSendInput = Pick<PrototypeReviewRequest, 'page'>
export type PrototypeReviewPeerTarget = ReviewPeerTarget

export const PrototypeReviewDismissSchema = z.object({
  eventId: z.string().min(1),
  seenReceivedAt: z.string().datetime()
})

export function prototypeReviewEventId(
  request: Pick<PrototypeReviewRequest, 'cycleId' | 'page'>
): string {
  return `${request.cycleId}:${request.page.sourceEnvironmentId}:${request.page.documentKey}`
}
