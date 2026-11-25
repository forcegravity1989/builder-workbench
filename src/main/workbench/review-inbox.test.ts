import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ReviewIncomingRequest } from '../../shared/workbench/pr-review-request'
import {
  PrototypeReviewAnnotationAddSchema,
  type PrototypeReviewAnnotation
} from '../../shared/workbench/prototype-review-annotation'
import type { dismissReviewRequest, readReviewInbox, receiveReviewRequest } from './review-inbox'
import { installFakeAppEnvironment } from '../../../config/scripts/test-runtime/environment/vitest-host-ports-setup'

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

const notePayload = {
  page: { sanitizedUrl: 'orca-preview://doc', title: 'Doc' },
  target: {
    tagName: 'button',
    selector: '#buy',
    rectPage: { x: 1, y: 2, width: 30, height: 10 },
    rectViewport: { x: 1, y: 2, width: 30, height: 10 }
  },
  nearbyText: [],
  ancestorPath: [],
  screenshot: null
}

function note(id: string, documentKey: string): PrototypeReviewAnnotation {
  return {
    id,
    documentKey,
    comment: 'Make this clearer',
    intent: 'change',
    priority: 'important',
    payload: notePayload as never,
    author: '安迪',
    host: '朱宇',
    createdAt: '2026-11-24T00:00:00.000Z'
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

describe('review inbox and reviewer note stores', () => {
  it('clears every seen sender/round of the dismissed PR only, keeps unseen newer arrivals, survives a fresh read, and keeps reviewer notes per document', async () => {
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

    // Prototype notes submitted by reviewers are kept in the same user data, per document.
    const notes = await import('./prototype-review-annotations')
    await notes.addPrototypeReviewAnnotation(note('a', 'D:/repo/one.html'))
    await notes.addPrototypeReviewAnnotation(note('b', 'D:/repo/one.html'))
    await notes.addPrototypeReviewAnnotation(note('c', 'D:/repo/two.html'))
    const idsOf = async (key: string): Promise<string[]> =>
      (await notes.readPrototypeReviewAnnotations(key)).map((item) => item.id)
    expect(await idsOf('D:/repo/one.html')).toEqual(['a', 'b'])
    expect(await notes.deletePrototypeReviewAnnotation('D:/repo/one.html', 'a')).toBe(true)
    expect(await notes.deletePrototypeReviewAnnotation('D:/repo/one.html', 'a')).toBe(false)
    expect(await idsOf('D:/repo/one.html')).toEqual(['b'])
    expect(await idsOf('D:/repo/two.html')).toEqual(['c'])
    // The same Windows file reached through another spelling reads the same notes.
    expect(await idsOf('d:\\repo\\TWO.html')).toEqual(['c'])

    // A screenshot never travels between machines, and a note the owner's tray cannot place on the
    // page is refused rather than stored.
    const fields = {
      id: 'x',
      documentKey: 'D:/repo/one.html',
      comment: 'hi',
      intent: 'fix',
      priority: 'blocking'
    }
    const accepts = (payload: unknown): boolean =>
      PrototypeReviewAnnotationAddSchema.safeParse({ ...fields, payload }).success
    expect(accepts(notePayload)).toBe(true)
    expect(accepts({ ...notePayload, screenshot: { dataUrl: 'data:image/png;base64,AAAA' } })).toBe(
      false
    )
    expect(accepts({ ...notePayload, target: { tagName: 'button', selector: '#buy' } })).toBe(false)

    const notesPath = join(dir, 'workbench-prototype-review-annotations-v2.json')
    writeFileSync(notesPath, '{invalid')
    vi.resetModules()
    const freshNotes = await import('./prototype-review-annotations')
    await expect(freshNotes.readPrototypeReviewAnnotations('D:/repo/0.html')).rejects.toThrow()
    await expect(freshNotes.readPrototypeReviewAnnotations('D:/repo/0.html')).rejects.toThrow()
    writeFileSync(
      notesPath,
      JSON.stringify(
        Array.from({ length: 500 }, (_, index) => note(`${index}`, `D:/repo/${index}.html`))
      )
    )
    await expect(
      freshNotes.addPrototypeReviewAnnotation(note('new', 'D:/repo/new.html'))
    ).rejects.toThrow('批注的文档数已达上限')
    await freshNotes.deletePrototypeReviewAnnotation('D:/repo/0.html', '0')
    await expect(
      freshNotes.addPrototypeReviewAnnotation(note('new', 'D:/repo/new.html'))
    ).resolves.toMatchObject({ id: 'new' })
  })
})
