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
    [
      401,
      { error: { code: 'unauthorized', message: 'Missing or invalid x-upload-token header.' } },
      'unauthorized'
    ],
    [
      403,
      { error: { code: 'forbidden', message: 'Edit token does not match this share.' } },
      'forbidden'
    ],
    [
      413,
      { error: { code: 'too_large', message: 'content exceeds 10485760 bytes.' } },
      'too-large'
    ],
    [
      429,
      { error: { code: 'rate_limited', message: 'Too many writes; retry in a minute.' } },
      'rate-limited'
    ],
    [
      415,
      { error: { code: 'unsupported_media_type', message: 'Only text/html content is accepted.' } },
      'unsupported'
    ],
    [404, { error: { code: 'not_found', message: 'Share not found.' } }, 'not-found'],
    [
      503,
      { error: { code: 'busy', message: 'Too many uploads in flight; retry shortly.' } },
      'busy'
    ],
    [500, { error: { code: 'internal', message: 'Internal server error.' } }, 'server']
  ])('maps HTTP %i to %s', async (status, body, expected) => {
    await expect(codeFor(respond(status, body))).resolves.toBe(expected)
  })

  it('follows the service error code rather than the status', async () => {
    // A reverse proxy or a future service change can pair any status with a known code; the code
    // is the declared contract, so it wins.
    await expect(
      codeFor(
        respond(500, { error: { code: 'too_large', message: 'content exceeds 1024 bytes.' } })
      )
    ).resolves.toBe('too-large')
  })

  it('falls back to the status when the body is not the service envelope', async () => {
    // A proxy in front of the service answers 413 with its own HTML page.
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>413</html>', {
          status: 413,
          headers: { 'content-type': 'text/html' }
        })
    ) as unknown as typeof fetch

    await expect(codeFor(fetchImpl)).resolves.toBe('too-large')
  })

  it('reports a full enrollment registry as needing an operator, not a retry', async () => {
    const error = await createShare(
      {
        ...config,
        fetchImpl: respond(503, {
          error: {
            code: 'enrollment_full',
            message: 'Client token registry is full; contact the operator.'
          }
        })
      },
      { content: '<h1>A</h1>', fileName: 'a.html' }
    ).then(
      () => null,
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(ShareServiceError)
    // Its own code: 'busy' would borrow the "try again shortly" copy for a state that only an
    // operator can clear.
    expect((error as ShareServiceError).code).toBe('enrollment-full')
    expect((error as ShareServiceError).message).toContain('需要运维处理')
  })

  it('reports an unreadable device registry as needing an operator', async () => {
    const error = await createShare(
      {
        ...config,
        fetchImpl: respond(503, {
          error: {
            code: 'registry_unavailable',
            message:
              'Device registry is unreadable; uploads are refused until an operator restores it.'
          }
        })
      },
      { content: '<h1>A</h1>', fileName: 'a.html' }
    ).then(
      () => null,
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(ShareServiceError)
    expect((error as ShareServiceError).code).toBe('registry-unavailable')
    expect((error as ShareServiceError).message).toContain('需要运维')
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

  it('releases the body of a delete it does not read', async () => {
    // An unread undici body can take the whole process down (orca#8695); the 404 short-circuit
    // returns without parsing, so it has to cancel explicitly.
    const response = new Response('{"error":{"code":"not_found","message":"Share not found."}}', {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })
    const cancel = vi.spyOn(response.body!, 'cancel')

    await expect(
      deleteShare(
        { ...config, fetchImpl: vi.fn(async () => response) as unknown as typeof fetch },
        'share-a',
        'edit-a'
      )
    ).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalled()
  })
})
