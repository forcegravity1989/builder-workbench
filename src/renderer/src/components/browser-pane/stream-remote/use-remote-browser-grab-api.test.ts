// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRemoteBrowserGrabApi } from './use-remote-browser-grab-api'

const callRuntimeRpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc }))

const TARGET = { kind: 'environment', environmentId: 'env-1' } as const

function renderApi(remotePageId: string | null = 'host-page-1') {
  return renderHook(() =>
    useRemoteBrowserGrabApi({
      runtimeTarget: () => TARGET,
      runtimeWorktree: 'wt-1',
      remotePageId
    })
  ).result.current
}

describe('useRemoteBrowserGrabApi', () => {
  beforeEach(() => {
    callRuntimeRpc.mockReset()
  })
  afterEach(cleanup)

  it('addresses the host page, not the local tab id the picker was started with', async () => {
    callRuntimeRpc.mockResolvedValue({ ok: true })
    await renderApi().setGrabMode({ browserPageId: 'local-tab', enabled: true })
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      TARGET,
      'browser.grab.setMode',
      { worktree: 'wt-1', page: 'host-page-1', enabled: true },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })

  it('waits far longer for a pick than for plumbing calls', async () => {
    callRuntimeRpc.mockResolvedValue({ opId: 'op-1', kind: 'cancelled', reason: 'user' })
    const api = renderApi()
    await api.awaitGrabSelection({ browserPageId: 'local-tab', opId: 'op-1' })
    await api.cancelGrab({ browserPageId: 'local-tab' })
    const [awaitCall, cancelCall] = callRuntimeRpc.mock.calls
    expect(awaitCall[3].timeoutMs).toBeGreaterThan(cancelCall[3].timeoutMs)
  })

  it('reports a failed start as not ready, and a failed stop as harmless', async () => {
    callRuntimeRpc.mockRejectedValue(new Error('offline'))
    const api = renderApi()
    expect(await api.setGrabMode({ browserPageId: 'x', enabled: true })).toEqual({
      ok: false,
      reason: 'not-ready'
    })
    expect(await api.setGrabMode({ browserPageId: 'x', enabled: false })).toEqual({ ok: true })
  })

  it('turns a failed wait into an error result carrying the operation id', async () => {
    callRuntimeRpc.mockRejectedValue(new Error('offline'))
    expect(await renderApi().awaitGrabSelection({ browserPageId: 'x', opId: 'op-9' })).toEqual({
      opId: 'op-9',
      kind: 'error',
      reason: 'offline'
    })
  })

  it('does not call the host before the page has a host-side identity', async () => {
    const result = await renderApi(null).setGrabMode({ browserPageId: 'x', enabled: true })
    expect(result).toEqual({ ok: false, reason: 'not-ready' })
    expect(callRuntimeRpc).not.toHaveBeenCalled()
  })
})
