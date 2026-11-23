import { z } from 'zod'
import type { ReviewPeerTarget } from './pr-review-request'

export const PrototypeReviewPageRefSchema = z.object({
  sourceEnvironmentId: z.string().min(1),
  /** Stable runtime identity used to resolve a sender's local environment on another client. */
  sourceRuntimeId: z.string().min(1).optional(),
  sourceHostName: z.string().trim().min(1).max(200),
  worktreeId: z.string().min(1).max(500),
  sessionId: z.string().min(1).max(500),
  browserPageId: z.string().min(1).max(500),
  documentKey: z.string().min(1).max(2000),
  title: z.string().trim().min(1).max(500)
})
export type PrototypeReviewPageRef = z.infer<typeof PrototypeReviewPageRefSchema>

export const PrototypeReviewRequestSchema = z.object({
  event: z.literal('prototype-review'),
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
  return `${request.cycleId}:${request.page.sourceEnvironmentId}:${request.page.browserPageId}`
}
