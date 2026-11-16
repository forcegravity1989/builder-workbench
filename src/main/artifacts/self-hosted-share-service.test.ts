import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHARE_MAX_CONTENT_BYTES } from '../../shared/workbench/share'
import { createShareService } from './self-hosted-share-service'

type Call = { method: string; url: string; headers: Headers; body: unknown }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

const created = {
  id: 'share-a',
  url: 'http://share.example.com/s/share-a',
  editToken: 'edit-a',
  expiresAt: '2026-12-16T00:00:00.000Z'
}

describe('createShareService', () => {
  let dataDir: string
  let calls: Call[]
  let fetchImpl: ReturnType<typeof vi.fn>

  const service = () =>
    createShareService({ dataDir: () => dataDir, fetchImpl: fetchImpl as unknown as typeof fetch })

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'bw-share-service-'))
    calls = []
    fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as string, init)
      const body = init?.body ? JSON.parse(init.body as string) : null
      calls.push({ method: request.method, url: request.url, headers: request.headers, body })
      if (request.url.endsWith('/healthz')) {
        return jsonResponse(200, { status: 'ok' })
      }
      if (request.method === 'POST') {
        return jsonResponse(201, created)
      }
      if (request.method === 'PUT') {
        return jsonResponse(200, {
          id: 'share-a',
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

  it('refuses to publish before a server is configured', async () => {
    const result = await service().publish({
      sourceKey: '/repo/a.html',
      content: '<h1>A</h1>',
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'not-configured' } })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('creates a share with the upload token and remembers the link', async () => {
    const share = service()
    await share.saveConfig({
      serverUrl: 'http://share.example.com/',
      uploadToken: 'upload-secret'
    })

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
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://share.example.com/api/shares',
      body: { content: '<h1>A</h1>', fileName: 'a.html', title: 'Report' }
    })
    expect(calls[0]?.headers.get('x-upload-token')).toBe('upload-secret')

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
    await share.saveConfig({ serverUrl: 'http://share.example.com', uploadToken: 'upload-secret' })
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })

    const result = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>B</h1>',
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: true, value: { change: 'updated' } })
    expect(calls[1]).toMatchObject({
      method: 'PUT',
      url: 'http://share.example.com/api/shares/share-a'
    })
    expect(calls[1]?.headers.get('x-edit-token')).toBe('edit-a')
  })

  it('creates a fresh share when the remote link is gone', async () => {
    const share = service()
    await share.saveConfig({ serverUrl: 'http://share.example.com', uploadToken: 'upload-secret' })
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
    expect(calls.map((call) => call.method)).toEqual(['POST', 'PUT', 'POST'])
  })

  it('rejects oversized content before touching the network', async () => {
    const share = service()
    await share.saveConfig({ serverUrl: 'http://share.example.com', uploadToken: 'upload-secret' })

    const result = await share.publish({
      sourceKey: '/repo/a.html',
      content: 'a'.repeat(SHARE_MAX_CONTENT_BYTES + 1),
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'too-large' } })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps an upload-token rejection to unauthorized', async () => {
    const share = service()
    await share.saveConfig({ serverUrl: 'http://share.example.com', uploadToken: 'wrong' })
    fetchImpl.mockImplementationOnce(async () =>
      jsonResponse(401, { error: { code: 'unauthorized', message: 'bad token' } })
    )

    const result = await share.publish({
      sourceKey: '/repo/a.html',
      content: '<h1>A</h1>',
      fileName: 'a.html'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
  })

  it('deletes the remote share before dropping the local record', async () => {
    const share = service()
    await share.saveConfig({ serverUrl: 'http://share.example.com', uploadToken: 'upload-secret' })
    await share.publish({ sourceKey: '/repo/a.html', content: '<h1>A</h1>', fileName: 'a.html' })

    await expect(share.remove('/repo/a.html')).resolves.toEqual({ ok: true, value: null })
    expect(calls[1]).toMatchObject({
      method: 'DELETE',
      url: 'http://share.example.com/api/shares/share-a'
    })
    expect(calls[1]?.headers.get('x-edit-token')).toBe('edit-a')
    await expect(share.getLink('/repo/a.html')).resolves.toEqual({ ok: true, value: null })
  })

  it('checks connectivity against the health endpoint', async () => {
    await expect(
      service().testConfig({ serverUrl: 'http://share.example.com/', uploadToken: 'token' })
    ).resolves.toEqual({ ok: true, value: { serverUrl: 'http://share.example.com' } })
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'http://share.example.com/healthz'
    })
  })
})
