import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublishedArtifactLink } from './artifact-published-link-client'

const mocks = vi.hoisted(() => ({ callRuntimeRpc: vi.fn() }))

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.callRuntimeRpc }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('published artifact link client', () => {
  it('returns the locally persisted public link', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({
      ok: true,
      value: {
        id: 'share-a',
        url: 'http://7.192.170.220:8787/s/share-a',
        expiresAt: '2026-12-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z'
      }
    })

    await expect(getPublishedArtifactLink('/repo/report.md')).resolves.toBe(
      'http://7.192.170.220:8787/s/share-a'
    )
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'workbench.share.getLink',
      { sourceKey: '/repo/report.md' }
    )
  })

  it('returns null when the source has not been shared', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ ok: true, value: null })
    await expect(getPublishedArtifactLink('/repo/report.md')).resolves.toBeNull()
  })

  it('throws the service message when the lookup fails', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({
      ok: false,
      error: { code: 'unknown', message: 'index unreadable' }
    })
    await expect(getPublishedArtifactLink('/repo/report.md')).rejects.toThrow('index unreadable')
  })
})
