import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHARE_MAX_CONTENT_BYTES } from '../../shared/workbench/share'
import { createShareService } from './self-hosted-share-service'

type Call = { method: string; url: string; headers: Headers; body: unknown }

const SERVER_URL = 'http://share.example.com'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

const created = {
  id: 'share-a',
  url: `${SERVER_URL}/s/share-a`,
  editToken: 'edit-a',
  expiresAt: '2026-12-16T00:00:00.000Z'
}

describe('createShareService', () => {
  let dataDir: string
  let calls: Call[]
  let fetchImpl: ReturnType<typeof vi.fn>
  let issuedTokens: number

  const service = (overrides: { enrollKey?: string } = {}) =>
    createShareService({
      dataDir: () => dataDir,
      serverUrl: SERVER_URL,
      enrollKey: overrides.enrollKey ?? 'enroll-key',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'bw-share-service-'))
    calls = []
    issuedTokens = 0
    fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      const body = init?.body ? JSON.parse(init.body as string) : null
      calls.push({ method: request.method, url: request.url, headers: request.headers, body })
      if (request.url.endsWith('/api/client-tokens')) {
        issuedTokens += 1
        return jsonResponse(201, {
          token: `enrolled-token-${issuedTokens}`,
          createdAt: '2026-11-16T00:00:00.000Z'
        })
      }
      if (request.method === 'POST') {
        return jsonResponse(201, created)
      }
      if (request.method === 'PUT') {
        return jsonResponse(200, {
          id: created.id,
          url: created.url,
          expiresAt: created.expiresAt,
          updatedAt: '2026-11-16T12:00:00.000Z'
        })
      }
      return new Response(null, { status: 204 })
    })
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('enrolls on first use and reuses the token for later shares', async () => {
    const share = service()

    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })
    await share.publish({ sourceKey: '/repo/b.html', content: '<h1>B</h1>', fileName: 'b.html' })

    expect(calls.filter((call) => call.url.endsWith('/api/client-tokens'))).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${SERVER_URL}/api/client-tokens` })
    expect(calls[0]?.headers.get('x-enroll-key')).toBe('enroll-key')
    expect(calls[1]).toMatchObject({ method: 'POST', url: `${SERVER_URL}/api/shares` })
    expect(calls[1]?.headers.get('x-upload-token')).toBe('enrolled-token-1')
    expect(calls[2]).toMatchObject({ method: 'POST', url: `${SERVER_URL}/api/shares` })
    expect(calls[2]?.headers.get('x-upload-token')).toBe('enrolled-token-1')
  })

  it('creates a share and remembers the link without leaking the edit token', async () => {
    const share = service()

    const result = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>A</h1>',
      fileName: 'a.html',
      title: 'Report'
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: created.id,
        url: created.url,
        expiresAt: created.expiresAt,
        change: 'created'
      }
    })
    // The renderer may display the link, but the edit token must stay in the host process.
    expect(result.ok && 'editToken' in result.value).toBe(false)
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: `${SERVER_URL}/api/shares`,
      body: { content: '<h1>A</h1>', fileName: 'a.html', title: 'Report' }
    })

    await expect(share.getLink('/repo/a.html')).resolves.toMatchObject({
      ok: true,
      value: { url: created.url }
    })
    await expect(share.getLink('/repo/other.html')).resolves.toEqual({
      ok: true,
      value: null
    })
  })

  it('updates an existing share through its edit token', async () => {
    const share = service()
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })

    const result = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>B</h1>',
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: true, value: { change: 'updated' } })
    expect(calls[2]).toMatchObject({
      method: 'PUT',
      url: `${SERVER_URL}/api/shares/share-a`
    })
    expect(calls[2]?.headers.get('x-edit-token')).toBe('edit-a')
  })

  it('creates a fresh share when the remote link is gone', async () => {
    const share = service()
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })
    fetchImpl.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      calls.push({ method: request.method, url: request.url, headers: request.headers, body: null })
      return jsonResponse(404, { error: { code: 'not_found' } })
    })

    const result = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>B</h1>',
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: true, value: { change: 'created' } })
    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST', 'PUT', 'POST'])
  })

  it('rejects oversized content before touching the network', async () => {
    const result = await service().publish({
      sourceKey: '/repo/a.html',
      content: 'a'.repeat(SHARE_MAX_CONTENT_BYTES + 1),
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'too-large' } })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('re-enrolls and retries once when the server rejects the stored token', async () => {
    const share = service()
    let rejected = false
    fetchImpl.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      calls.push({ method: request.method, url: request.url, headers: request.headers, body: null })
      if (request.url.endsWith('/api/client-tokens')) {
        issuedTokens += 1
        return jsonResponse(201, { token: `enrolled-token-${issuedTokens}` })
      }
      if (!rejected) {
        rejected = true
        return jsonResponse(401, { error: { code: 'unauthorized' } })
      }
      return jsonResponse(201, created)
    })

    const result = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>A</h1>',
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: true, value: { change: 'created' } })
    expect(calls.filter((call) => call.url.endsWith('/api/client-tokens'))).toHaveLength(2)
    expect(calls.at(-1)?.headers.get('x-upload-token')).toBe('enrolled-token-2')
  })

  it('reports an enrollment rejection as unauthorized', async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'unauthorized' } }))

    const result = await service().publish({
      sourceKey: '/repo/a.html',
      content: '<h1>A</h1>',
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
  })

  it('deletes the remote share before dropping the local record', async () => {
    const share = service()
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })

    await expect(share.remove('/repo/a.html')).resolves.toEqual({ ok: true, value: null })
    expect(calls[2]).toMatchObject({
      method: 'DELETE',
      url: `${SERVER_URL}/api/shares/share-a`
    })
    expect(calls[2]?.headers.get('x-edit-token')).toBe('edit-a')
    await expect(share.getLink('/repo/a.html')).resolves.toEqual({ ok: true, value: null })
  })

  it('updates and removes with the edit token even when enrollment is unavailable', async () => {
    const share = service()
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })
    calls = []
    fetchImpl.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      calls.push({ method: request.method, url: request.url, headers: request.headers, body: null })
      if (request.url.endsWith('/api/client-tokens')) {
        return jsonResponse(503, { error: { code: 'busy' } })
      }
      if (request.method === 'PUT') {
        return jsonResponse(200, {
          id: created.id,
          url: created.url,
          expiresAt: created.expiresAt,
          updatedAt: '2026-11-16T12:00:00.000Z'
        })
      }
      return new Response(null, { status: 204 })
    })

    await expect(
      share.publish({ sourceKey: '/repo/a.html', content: '<h1>B</h1>', fileName: 'a.html' })
    ).resolves.toMatchObject({ ok: true, value: { change: 'updated' } })
    await expect(share.remove('/repo/a.html')).resolves.toEqual({ ok: true, value: null })
    expect(calls.some((call) => call.url.endsWith('/api/client-tokens'))).toBe(false)
  })

  it('does not contact the network when removing an unknown file', async () => {
    await expect(service().remove('/repo/none.html')).resolves.toEqual({ ok: true, value: null })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
