import { describe, expect, it } from 'vitest'
import type { ReviewIncomingRequest } from '../../../../shared/workbench/pr-review-request'
import {
  applyIncomingRequest,
  isIncomingReviewCompleted,
  reconcileIncomingRequests,
  EMPTY_REVIEW_NOTIFICATIONS
} from './model'

function request(prNumber: number, round = 1): ReviewIncomingRequest {
  return {
    repo: { host: 'github.com', path: 'team/workbench' },
    prNumber,
    title: `Review ${prNumber}`,
    sourceBranch: 'feature',
    targetBranch: 'main',
    sender: 'Alice',
    senderId: 'peer',
    cycleId: '11111111-1111-4111-8111-111111111111',
    cycleStartedAt: '2026-11-18T00:00:00.000Z',
    round,
    sentAt: '2026-11-18T00:00:00.000Z',
    receivedAt: '2026-11-18T00:00:01.000Z'
  }
}

describe('incoming review reconciliation', () => {
  it('drops notes the runtime inbox no longer holds, keeps an unchanged inbox intact, and completes only on a definitive merged/closed readback', () => {
    const state = applyIncomingRequest(
      applyIncomingRequest(EMPTY_REVIEW_NOTIFICATIONS, request(1)),
      request(2)
    )

    const reconciled = reconcileIncomingRequests(state, [request(1)])
    expect(reconciled.incoming.map((note) => note.prNumber)).toEqual([1])
    expect(reconcileIncomingRequests(state, [request(1), request(2)])).toBe(state)

    const readback = {
      openCommentCount: null,
      merged: false,
      prState: 'open' as const,
      checksState: null,
      checkedAt: '2026-11-18T00:00:00.000Z'
    }
    expect(isIncomingReviewCompleted(null)).toBe(false)
    expect(isIncomingReviewCompleted({ ...readback, prState: 'draft' })).toBe(false)
    expect(isIncomingReviewCompleted({ ...readback, prState: 'open' })).toBe(false)
    expect(isIncomingReviewCompleted({ ...readback, prState: 'closed' })).toBe(true)
    expect(isIncomingReviewCompleted({ ...readback, merged: true, prState: 'merged' })).toBe(true)
  })
})
