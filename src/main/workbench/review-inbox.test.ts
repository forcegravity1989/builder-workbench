import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ReviewIncomingRequest } from '../../shared/workbench/pr-review-request'
import type { dismissReviewRequest, readReviewInbox, receiveReviewRequest } from './review-inbox'
import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'

type InboxModule = {
  dismissReviewRequest: typeof dismissReviewRequest
  readReviewInbox: typeof readReviewInbox
  receiveReviewRequest: typeof receiveReviewRequest
}

const repo = { host: 'github.com', path: 'team/workbench' }

function request(prNumber: number, senderId = 'peer'): ReviewIncomingRequest {
  return {
    repo,
    prNumber,
    title: `Review ${prNumber}`,
    sourceBranch: 'feature',
    targetBranch: 'main',
    sender: 'Alice',
    senderId,
    cycleId: '11111111-1111-4111-8111-111111111111',
    cycleStartedAt: '2026-11-18T00:00:00.000Z',
    round: 1,
    sentAt: '2026-11-18T00:00:00.000Z',
    receivedAt: '2026-11-18T00:00:01.000Z'
  }
}

let dir = ''

async function loadInbox(): Promise<InboxModule> {
  vi.resetModules()
  return import('./review-inbox')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bw-review-inbox-'))
  installFakeAppEnvironment({ getPath: () => dir })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('review inbox dismissal protocol', () => {
  it('clears every seen sender/round of the dismissed PR only, keeps unseen newer arrivals, and survives a fresh read', async () => {
    const inbox = await loadInbox()
    await inbox.receiveReviewRequest(request(1))
    await inbox.receiveReviewRequest(request(2))
    await inbox.receiveReviewRequest(request(7, 'peer-a'))
    await inbox.receiveReviewRequest({
      ...request(7, 'peer-b'),
      cycleId: '22222222-2222-4222-8222-222222222222',
      round: 2
    })
    const seen = (await inbox.readReviewInbox()).find((item) => item.prNumber === 7)!.receivedAt

    // A request acknowledged after the user's snapshot must not be swallowed by the dismissal.
    await inbox.receiveReviewRequest({
      ...request(7, 'peer-c'),
      cycleId: '33333333-3333-4333-8333-333333333333'
    })

    await expect(inbox.dismissReviewRequest(repo, 7, seen)).resolves.toBe(true)
    const afterSeven = await inbox.readReviewInbox()
    expect(afterSeven.map((item) => item.prNumber)).toEqual([1, 2, 7])
    expect(afterSeven.find((item) => item.prNumber === 7)!.senderId).toBe('peer-c')

    const seenSeven = afterSeven.find((item) => item.prNumber === 7)!.receivedAt
    await expect(inbox.dismissReviewRequest(repo, 7, seenSeven)).resolves.toBe(true)
    await expect(inbox.dismissReviewRequest(repo, 1, seen)).resolves.toBe(true)
    expect((await inbox.readReviewInbox()).map((item) => item.prNumber)).toEqual([2])

    // A snapshot older than every stored entry dismisses nothing.
    await expect(inbox.dismissReviewRequest(repo, 2, '2000-01-01T00:00:00.000Z')).resolves.toBe(
      false
    )

    const reloaded = await loadInbox()
    expect((await reloaded.readReviewInbox()).map((item) => item.prNumber)).toEqual([2])
    await expect(reloaded.dismissReviewRequest(repo, 1, seen)).resolves.toBe(false)
  })
})
