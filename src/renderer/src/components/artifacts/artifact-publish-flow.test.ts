import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SHARE_MAX_CONTENT_BYTES } from '../../../../shared/workbench/share'
import { publishArtifactFromSurface } from './artifact-publish-flow'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  // happy-dom's DOM implementation strips block tags here; the real renderer runs DOMPurify.
  sanitize: vi.fn((html: string) => html)
}))

vi.mock('dompurify', () => ({ default: { sanitize: mocks.sanitize } }))

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.callRuntimeRpc }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}))

const request = {
  sourceKey: '/repo/report.html',
  content: '<h1>Report</h1>',
  contentType: 'text/html' as const,
  fileName: 'report.html'
}
const published = {
  id: 'share-a',
  url: 'http://7.192.170.220:8787/s/share-a',
  expiresAt: '2026-12-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
  change: 'created' as const
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('artifact publish flow', () => {
  it('publishes HTML through the self-hosted share service', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ ok: true, value: published })
    const createRequest = vi.fn().mockResolvedValue(request)

    await expect(publishArtifactFromSurface(createRequest)).resolves.toBe(published)
    expect(createRequest).toHaveBeenCalledOnce()
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'workbench.share.publish',
      { sourceKey: request.sourceKey, content: request.content, fileName: request.fileName }
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Artifact shared')
  })

  it('renders Markdown into a standalone HTML page before upload', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ ok: true, value: { ...published, change: 'updated' } })
    const createRequest = vi.fn().mockResolvedValue({
      sourceKey: '/repo/notes.md',
      content: '# Notes',
      contentType: 'text/markdown' as const,
      fileName: 'notes.md'
    })

    await expect(publishArtifactFromSurface(createRequest)).resolves.toMatchObject({
      change: 'updated'
    })
    const payload = mocks.callRuntimeRpc.mock.calls[0]?.[2] as { content: string; fileName: string }
    expect(payload.fileName).toBe('notes.html')
    expect(payload.content).toMatch(/<h1[^>]*>Notes<\/h1>/)
    expect(mocks.sanitize).toHaveBeenCalledWith('<h1>Notes</h1>\n', {
      USE_PROFILES: { html: true }
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Artifact updated')
  })

  it('surfaces a service error without reporting success', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({
      ok: false,
      error: { code: 'unauthorized', message: 'Token rejected' }
    })

    await expect(publishArtifactFromSurface(() => Promise.resolve(request))).resolves.toBeNull()
    expect(mocks.toastError).toHaveBeenCalledWith('Could not share artifact', {
      description: 'The share server rejected the upload token. Check it in Settings → Artifacts.'
    })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('uses the dedicated message when the share server is not configured', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({
      ok: false,
      error: { code: 'not-configured', message: '尚未配置分享服务地址' }
    })

    await publishArtifactFromSurface(() => Promise.resolve(request))
    expect(mocks.toastError).toHaveBeenCalledWith('Share server is not configured', {
      description: 'Set the share server address and upload token in Settings → Artifacts.'
    })
  })

  it('turns transport codes into actionable guidance', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: '无法连接分享服务：fetch failed' }
    })

    await publishArtifactFromSurface(() => Promise.resolve(request))
    expect(mocks.toastError).toHaveBeenCalledWith('Could not share artifact', {
      description: 'Could not reach the share server. Check the address and network.'
    })
  })

  it('keeps the host message for codes it does not know', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({
      ok: false,
      error: { code: 'unknown', message: 'disk full' }
    })

    await publishArtifactFromSurface(() => Promise.resolve(request))
    expect(mocks.toastError).toHaveBeenCalledWith('Could not share artifact', {
      description: 'disk full'
    })
  })

  it('rejects an empty file before RPC', async () => {
    await expect(
      publishArtifactFromSurface(() => Promise.resolve({ ...request, content: '' }))
    ).resolves.toBeNull()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Could not share artifact', {
      description: 'This file is empty.'
    })
  })

  it('rejects an oversized request before RPC', async () => {
    await expect(
      publishArtifactFromSurface(() =>
        Promise.resolve({ ...request, content: 'a'.repeat(SHARE_MAX_CONTENT_BYTES + 1) })
      )
    ).resolves.toBeNull()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Could not share artifact', {
      description: 'This artifact is too large to share.'
    })
  })

  it('publishes content at the 10 MiB boundary', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ ok: true, value: published })
    const content = 'a'.repeat(SHARE_MAX_CONTENT_BYTES)

    await expect(
      publishArtifactFromSurface(() => Promise.resolve({ ...request, content }))
    ).resolves.toBe(published)
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'workbench.share.publish',
      expect.objectContaining({ content })
    )
  })

  it('reports RPC transport failures as a sharing failure', async () => {
    mocks.callRuntimeRpc.mockRejectedValue(new Error('rpc down'))

    await expect(publishArtifactFromSurface(() => Promise.resolve(request))).resolves.toBeNull()
    expect(mocks.toastError).toHaveBeenCalledWith('Could not share artifact', undefined)
  })
})
