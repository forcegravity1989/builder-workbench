import { describe, expect, it, vi } from 'vitest'
import {
  createShare,
  deleteShare,
  ShareServiceError,
  updateShare
} from './self-hosted-share-client'

const config = {
  serverUrl: 'http://share.example.com',
  uploadToken: 'upload-secret'
}

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
      })
  ) as unknown as typeof fetch
}

async function codeFor(fetchImpl: typeof fetch): Promise<string> {
  try {
    await createShare({ ...config, fetchImpl }, { content: '<h1>A</h1>', fileName: 'a.html' })
  } catch (error) {
    if (error instanceof ShareServiceError) {
      return error.code
    }
    return `unexpected: ${String(error)}`
  }
  return 'resolved'
}

describe('self-hosted share client status mapping', () => {
  it.each([
    [401, { error: { code: 'unauthorized', message: 'bad token' } }, 'unauthorized'],
    [403, { error: { code: 'forbidden', message: 'bad edit token' } }, 'forbidden'],
    [413, { error: { code: 'too_large', message: 'too big' } }, 'too-large'],
    [429, { error: { code: 'rate_limited', message: 'slow down' } }, 'rate-limited'],
    [415, { error: { code: 'unsupported_type', message: 'html only' } }, 'unsupported'],
    [404, { error: { code: 'not_found', message: 'missing' } }, 'not-found'],
    [503, { error: { code: 'busy', message: 'service busy' } }, 'busy'],
    [500, { error: { code: 'internal', message: 'boom' } }, 'server']
  ])('maps HTTP %i to %s', async (status, body, expected) => {
    await expect(codeFor(respond(status, body))).resolves.toBe(expected)
  })

  it('reports a transport failure as a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed')
    }) as unknown as typeof fetch

    await expect(codeFor(fetchImpl)).resolves.toBe('network')
  })

  it('keeps the edit token out of update and delete requests', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'share-a',
            url: 'http://share.example.com/s/share-a',
            expiresAt: '2026-12-16T00:00:00.000Z',
            updatedAt: '2026-11-16T00:00:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )

    await updateShare(
      { ...config, fetchImpl: fetchImpl as unknown as typeof fetch },
      'share-a',
      'edit-a',
      { content: '<h1>B</h1>', fileName: 'a.html' }
    )
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://share.example.com/api/shares/share-a')
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>)['x-edit-token']).toBe('edit-a')
  })

  it('tolerates a link that is already gone when deleting', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))

    await expect(
      deleteShare(
        { ...config, fetchImpl: fetchImpl as unknown as typeof fetch },
        'share-a',
        'edit-a'
      )
    ).resolves.toBeUndefined()
  })
})
