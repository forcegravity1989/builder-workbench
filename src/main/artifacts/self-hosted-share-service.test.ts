import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    const result = await createShareService({
      dataDir: () => dataDir,
      serverUrl: SERVER_URL,
      enrollKey: 'enroll-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxContentBytes: 1024
    }).publish({
      sourceKey: '/repo/a.html',
      content: 'a'.repeat(1025),
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

  it('serializes two shares of one file into a single link', async () => {
    const share = service()

    const [first, second] = await Promise.all([
      share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' }),
      share.publish({ sourceKey: '/repo/a.html', content: '<h1>A2</h1>', fileName: 'a.html' })
    ])

    // Without serialization both reads see "no record yet" and the loser's link is orphaned on the
    // server: no local record, no edit token, nothing in the product can remove it.
    expect(
      calls.filter((call) => call.method === 'POST' && call.url.endsWith('/api/shares'))
    ).toHaveLength(1)
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1)
    expect(first).toMatchObject({ ok: true, value: { change: 'created' } })
    expect(second).toMatchObject({ ok: true, value: { change: 'updated' } })
    await expect(share.list()).resolves.toMatchObject({
      ok: true,
      value: [{ sourceKey: '/repo/a.html', id: created.id }]
    })
  })

  it('recreates the link when the server refuses the stored edit token', async () => {
    const share = service()
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })
    fetchImpl.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      calls.push({ method: request.method, url: request.url, headers: request.headers, body: null })
      return jsonResponse(403, { error: { code: 'forbidden' } })
    })

    const result = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>B</h1>',
      fileName: 'a.html'
    })

    // The record came from a backup or another machine, so the link is not ours to update; a fresh
    // share has to work instead of failing the same way forever.
    expect(result).toMatchObject({ ok: true, value: { change: 'created' } })
    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST', 'PUT', 'POST'])
  })

  it('drops a record the server will not let it delete, and says the link may survive', async () => {
    const share = service()
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })
    fetchImpl.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      calls.push({ method: request.method, url: request.url, headers: request.headers, body: null })
      return jsonResponse(403, { error: { code: 'forbidden' } })
    })

    const result = await share.remove('/repo/a.html')

    expect(result).toMatchObject({ ok: false, error: { code: 'stale-record' } })
    expect(result.ok || result.error.message).toContain('原链接可能仍然存在')
    await expect(share.getLink('/repo/a.html')).resolves.toEqual({ ok: true, value: null })
    await expect(share.list()).resolves.toMatchObject({ ok: true, value: [] })
  })

  it('keeps one link when the service runs without retention', async () => {
    // BW_SHARE_RETENTION_DAYS=0 makes the service answer `expiresAt: null`. Stored as null the
    // record fails its own string check on reload, so every share would silently mint a new link.
    fetchImpl.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      calls.push({ method: request.method, url: request.url, headers: request.headers, body: null })
      if (request.url.endsWith('/api/client-tokens')) {
        issuedTokens += 1
        return jsonResponse(201, { token: `enrolled-token-${issuedTokens}` })
      }
      if (request.method === 'POST') {
        return jsonResponse(201, { ...created, expiresAt: null })
      }
      return jsonResponse(200, {
        id: created.id,
        url: created.url,
        expiresAt: null,
        updatedAt: '2026-11-16T12:00:00.000Z'
      })
    })
    const share = service()

    const first = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>A</h1>',
      fileName: 'a.html'
    })
    expect(first).toMatchObject({ ok: true, value: { change: 'created', expiresAt: '' } })

    const second = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>B</h1>',
      fileName: 'a.html'
    })
    expect(second).toMatchObject({ ok: true, value: { change: 'updated', id: created.id } })
    expect(
      calls.filter((call) => call.method === 'POST' && call.url.endsWith('/api/shares'))
    ).toHaveLength(1)
  })

  it('undoes the remote share when the local record cannot be written', async () => {
    // The link exists and its edit token dies with the failed write, which would leave a public
    // link nothing in the product can remove. Injection: the moment the service answers the
    // create, the data directory is replaced by a regular file, so the record write cannot land.
    fetchImpl.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      calls.push({ method: request.method, url: request.url, headers: request.headers, body: null })
      if (request.url.endsWith('/api/client-tokens')) {
        issuedTokens += 1
        return jsonResponse(201, { token: `enrolled-token-${issuedTokens}` })
      }
      if (request.method === 'POST') {
        await rm(dataDir, { recursive: true, force: true })
        await writeFile(dataDir, 'not a directory')
        return jsonResponse(201, created)
      }
      return new Response(null, { status: 204 })
    })

    const result = await service().publish({
      sourceKey: '/repo/a.html',
      content: '<h1>A</h1>',
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: false })
    // enroll, create, then the compensating delete — no link left behind without a record.
    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST', 'DELETE'])
    expect(calls[2]?.url).toBe(`${SERVER_URL}/api/shares/${created.id}`)
  })

  it('reports an unreadable record index instead of an empty list', async () => {
    const share = service()
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })
    // A zero-length file is what a rename that survived a power loss looks like: the links it
    // recorded are still live on the server, so "no files shared" would be a false all-clear.
    await writeFile(join(dataDir, 'records.json'), '')

    const result = await share.list()
    expect(result).toMatchObject({ ok: false, error: { code: 'records-unreadable' } })
    expect(result.ok || result.error.message).toContain('无法读取')

    await share.publish({ sourceKey: '/repo/b.html', content: '<h1>B</h1>', fileName: 'b.html' })
    await expect(share.list()).resolves.toMatchObject({
      ok: true,
      value: [{ sourceKey: '/repo/b.html' }]
    })
  })
})
