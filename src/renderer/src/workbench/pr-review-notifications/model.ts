import type { PRComment } from '../../../../shared/github/comment-types'
import {
  reviewRepositoryKey,
  type ReviewIncomingRequest,
  type ReviewPeerDelivery,
  type ReviewRepoIdentity,
  type ReviewRequestPayload
} from '../../../../shared/workbench/pr-review-request'

export type ReviewPrState = 'open' | 'closed' | 'merged' | 'draft'
export type ReviewCheckState = 'success' | 'failure' | 'pending' | 'neutral'
export type ReviewReadback = {
  openCommentCount: number | null
  merged: boolean | null
  prState: ReviewPrState | null
  checksState: ReviewCheckState | null
  checkedAt: string
}
type ReadbackState = { readback: ReviewReadback | null; readbackError: string | null }
export type ReviewIncomingNote = ReviewIncomingRequest & ReadbackState & { id: string }
export type ReviewOutgoingNote = ReviewRequestPayload &
  ReadbackState & {
    id: string
    roundStartedAt: string
    deliveries: ReviewPeerDelivery[]
  }
export type ReviewNotificationsState = {
  incoming: ReviewIncomingNote[]
  outgoing: ReviewOutgoingNote[]
}
export const EMPTY_REVIEW_NOTIFICATIONS: ReviewNotificationsState = { incoming: [], outgoing: [] }

export function reviewNoteId(repo: ReviewRepoIdentity, prNumber: number): string {
  return `${reviewRepositoryKey(repo)}#${prNumber}`
}
export function reviewReadbackKey(note: ReviewIncomingNote | ReviewOutgoingNote): string {
  return `${note.id}:${note.cycleId}:${note.round}:${note.sentAt}`
}
export function applyIncomingRequest(
  state: ReviewNotificationsState,
  request: ReviewIncomingRequest
): ReviewNotificationsState {
  const id = reviewNoteId(request.repo, request.prNumber)
  const existing = state.incoming.find((note) => note.id === id)
  if (existing?.cycleId === request.cycleId && existing.round >= request.round) return state
  const next = { ...request, id, readback: null, readbackError: null }
  return {
    ...state,
    incoming: [next, ...state.incoming.filter((note) => note.id !== id)].sort((a, b) =>
      b.receivedAt.localeCompare(a.receivedAt)
    )
  }
}
export function recordSentReview(
  state: ReviewNotificationsState,
  request: ReviewRequestPayload,
  deliveries: ReviewPeerDelivery[]
): ReviewNotificationsState {
  if (!deliveries.some((delivery) => delivery.ok)) return state
  const id = reviewNoteId(request.repo, request.prNumber)
  const next = {
    ...request,
    id,
    roundStartedAt: request.sentAt,
    deliveries,
    readback: null,
    readbackError: null
  }
  return { ...state, outgoing: [next, ...state.outgoing.filter((note) => note.id !== id)] }
}
export function deleteOutgoingNote(
  state: ReviewNotificationsState,
  id: string
): ReviewNotificationsState {
  return { ...state, outgoing: state.outgoing.filter((note) => note.id !== id) }
}

export function applyReviewReadback(
  state: ReviewNotificationsState,
  direction: 'incoming' | 'outgoing',
  key: string,
  readback: ReviewReadback | null,
  error: string | null
): ReviewNotificationsState {
  // A completion belongs to the captured cycle/round, never to a replacement sharing its PR number.
  const apply = <T extends ReviewIncomingNote | ReviewOutgoingNote>(notes: T[]): T[] =>
    notes.map((note) =>
      reviewReadbackKey(note) === key
        ? { ...note, readback: readback ?? note.readback, readbackError: error }
        : note
    )
  return direction === 'incoming'
    ? { ...state, incoming: apply(state.incoming) }
    : { ...state, outgoing: apply(state.outgoing) }
}

export function deriveOutgoingStatus(note: ReviewOutgoingNote) {
  return {
    merged: note.readback?.merged ?? null,
    openCommentCount: note.readback?.openCommentCount ?? null,
    prState: note.readback?.prState ?? null,
    checksState: note.readback?.checksState ?? null,
    checkedAt: note.readback?.checkedAt ?? null,
    error: note.readbackError,
    canReRequest:
      !note.readbackError &&
      note.readback?.merged === false &&
      (note.readback.prState === 'open' || note.readback.prState === 'draft') &&
      (note.readback.openCommentCount ?? 0) > 0
  }
}

// The caller must request complete review threads; conversation comments cannot prove thread completeness.
export function countUnresolvedReviewCommentsSince(
  comments: readonly PRComment[],
  sinceIso: string
): number | null {
  const since = Date.parse(sinceIso)
  if (!Number.isFinite(since)) return null
  const threads = new Map<string, { createdAt: number; resolved: boolean }>()
  for (const comment of comments) {
    if (!comment.threadId) continue
    const createdAt = Date.parse(comment.createdAt)
    if (!Number.isFinite(createdAt) || typeof comment.isResolved !== 'boolean') return null
    const previous = threads.get(comment.threadId)
    threads.set(comment.threadId, {
      createdAt: Math.min(createdAt, previous?.createdAt ?? Infinity),
      resolved: comment.isResolved
    })
  }
  return [...threads.values()].filter((thread) => thread.createdAt > since && !thread.resolved)
    .length
}

export function totalUnreadBadgeCount(state: ReviewNotificationsState): number {
  return state.incoming.length + state.outgoing.length
}
