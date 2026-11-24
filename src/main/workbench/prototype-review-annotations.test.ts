import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PrototypeReviewAnnotationAddSchema,
  type PrototypeReviewAnnotation
} from '../../shared/workbench/prototype-review-annotation'

let userDataPath = ''
vi.mock('../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: () => userDataPath
}))

const {
  addPrototypeReviewAnnotation,
  deletePrototypeReviewAnnotation,
  readPrototypeReviewAnnotations
} = await import('./prototype-review-annotations')

const payload = {
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
    payload: payload as never,
    author: '安迪',
    host: '朱宇',
    createdAt: '2026-11-24T00:00:00.000Z'
  }
}

describe('prototype review annotations', () => {
  beforeAll(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), 'bw-prototype-review-'))
  })
  afterAll(async () => {
    await rm(userDataPath, { recursive: true, force: true })
  })

  it('keeps submitted notes per document and lets a reviewer withdraw one', async () => {
    await addPrototypeReviewAnnotation(note('a', 'D:/repo/one.html'))
    await addPrototypeReviewAnnotation(note('b', 'D:/repo/one.html'))
    await addPrototypeReviewAnnotation(note('c', 'D:/repo/two.html'))

    expect(
      (await readPrototypeReviewAnnotations('D:/repo/one.html')).map((item) => item.id)
    ).toEqual(['a', 'b'])
    expect(await deletePrototypeReviewAnnotation('D:/repo/one.html', 'a')).toBe(true)
    expect(await deletePrototypeReviewAnnotation('D:/repo/one.html', 'a')).toBe(false)
    expect(
      (await readPrototypeReviewAnnotations('D:/repo/one.html')).map((item) => item.id)
    ).toEqual(['b'])
    expect(
      (await readPrototypeReviewAnnotations('D:/repo/two.html')).map((item) => item.id)
    ).toEqual(['c'])

    // A screenshot never travels between machines, so such a note is refused outright.
    const fields = {
      id: 'x',
      documentKey: 'D:/repo/one.html',
      comment: 'hi',
      intent: 'fix',
      priority: 'blocking'
    }
    expect(PrototypeReviewAnnotationAddSchema.safeParse({ ...fields, payload }).success).toBe(true)
    expect(
      PrototypeReviewAnnotationAddSchema.safeParse({
        ...fields,
        payload: { ...payload, screenshot: { dataUrl: 'data:image/png;base64,AAAA' } }
      }).success
    ).toBe(false)
    // A note the owner's tray cannot place on the page is refused rather than stored.
    expect(
      PrototypeReviewAnnotationAddSchema.safeParse({
        ...fields,
        payload: { ...payload, target: { tagName: 'button', selector: '#buy' } }
      }).success
    ).toBe(false)
  })
})
