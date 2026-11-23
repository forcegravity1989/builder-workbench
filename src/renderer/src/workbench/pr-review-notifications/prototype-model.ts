import {
  prototypeReviewEventId,
  type PrototypeReviewIncomingRequest,
  type PrototypeReviewRequest,
  type PrototypeReviewPageRef
} from '../../../../shared/workbench/prototype-review-request'
import type {
  ReviewPeerDelivery,
  ReviewPeerTarget
} from '../../../../shared/workbench/pr-review-request'

// oxlint-disable-next-line typescript/no-redundant-type-constituents -- zod-inferred request types are resolved by the runtime schema; the intersection adds the persisted identity fields.
export type PrototypeReviewIncomingNote = PrototypeReviewIncomingRequest & { id: string }
// oxlint-disable-next-line typescript/no-redundant-type-constituents -- zod-inferred request types are resolved by the runtime schema; the intersection adds delivery metadata.
export type PrototypeReviewOutgoingNote = PrototypeReviewRequest & {
  id: string
  deliveries: ReviewPeerDelivery[]
}
export type PrototypeReviewState = {
  incoming: PrototypeReviewIncomingNote[]
  outgoing: PrototypeReviewOutgoingNote[]
  pending: { request: PrototypeReviewRequest; targets: ReviewPeerTarget[] }[]
}

export const EMPTY_PROTOTYPE_REVIEW_STATE: PrototypeReviewState = {
  incoming: [],
  outgoing: [],
  pending: []
}

export function prototypeReviewId(
  request: Pick<PrototypeReviewRequest, 'page' | 'cycleId'>
): string {
  return prototypeReviewEventId(request)
}

export function prototypePageKey(page: PrototypeReviewPageRef): string {
  return `${page.sourceEnvironmentId}:${page.worktreeId}:${page.sessionId}:${page.browserPageId}`
}

export function applyIncomingPrototypeReview(
  state: PrototypeReviewState,
  request: PrototypeReviewIncomingRequest
): PrototypeReviewState {
  const id = prototypeReviewId(request)
  const existing = state.incoming.find((note) => note.id === id)
  if (existing && existing.round >= request.round) {
    return state
  }
  return {
    ...state,
    incoming: [{ ...request, id }, ...state.incoming.filter((note) => note.id !== id)].sort(
      (a, b) => b.receivedAt.localeCompare(a.receivedAt)
    )
  }
}

export function reconcileIncomingPrototypeReviews(
  state: PrototypeReviewState,
  requests: readonly PrototypeReviewIncomingRequest[]
): PrototypeReviewState {
  const present = new Set(requests.map(prototypeReviewId))
  let next = {
    ...state,
    incoming: state.incoming.filter((note) => present.has(note.id))
  }
  for (const request of requests) {
    next = applyIncomingPrototypeReview(next, request)
  }
  return next
}

export function recordSentPrototypeReview(
  state: PrototypeReviewState,
  request: PrototypeReviewRequest,
  deliveries: ReviewPeerDelivery[]
): PrototypeReviewState {
  if (!deliveries.some((delivery) => delivery.ok)) {
    return state
  }
  const id = prototypeReviewId(request)
  return {
    ...state,
    outgoing: [{ ...request, id, deliveries }, ...state.outgoing.filter((note) => note.id !== id)],
    pending: state.pending.filter((attempt) => prototypeReviewId(attempt.request) !== id)
  }
}

export function removePrototypeIncoming(
  state: PrototypeReviewState,
  id: string
): PrototypeReviewState {
  return { ...state, incoming: state.incoming.filter((note) => note.id !== id) }
}

export function deletePrototypeOutgoing(
  state: PrototypeReviewState,
  id: string
): PrototypeReviewState {
  return {
    ...state,
    outgoing: state.outgoing.filter((note) => note.id !== id),
    pending: state.pending.filter((attempt) => prototypeReviewId(attempt.request) !== id)
  }
}

export function prototypeReviewNotificationCount(state: PrototypeReviewState): number {
  return state.incoming.length + state.outgoing.length
}
