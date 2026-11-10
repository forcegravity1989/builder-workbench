import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RendererPublicationThrottle,
  type RendererPublicationThrottleTarget
} from './renderer-publication-throttle'

function createTarget(): RendererPublicationThrottleTarget & {
  calls: boolean[]
  destroyed: boolean
} {
  const calls: boolean[] = []
  return {
    calls,
    destroyed: false,
    capturePage: vi.fn(async () => undefined),
    isDestroyed() {
      return this.destroyed
    },
    setBackgroundThrottling(allowed) {
      calls.push(allowed)
    }
  }
}

describe('RendererPublicationThrottle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('unthrottles only while a publication lease is active', async () => {
    const target = createTarget()
    const throttle = new RendererPublicationThrottle()

    const release = throttle.acquire(target)
    release()

    expect(target.calls).toEqual([false])
    await vi.runOnlyPendingTimersAsync()
    expect(target.calls).toEqual([false, true])
    expect(target.capturePage).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 0, height: 0 },
      { stayHidden: true }
    )
  })

  it('keeps overlapping publications unthrottled until the last release', async () => {
    const target = createTarget()
    const throttle = new RendererPublicationThrottle()

    const releaseFirst = throttle.acquire(target)
    const releaseSecond = throttle.acquire(target)
    releaseFirst()
    releaseSecond()
    releaseSecond()

    expect(target.calls).toEqual([false])
    await vi.runOnlyPendingTimersAsync()
    expect(target.calls).toEqual([false, true])
    expect(target.capturePage).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 0, height: 0 },
      { stayHidden: true }
    )
  })

  it('does not restore throttling on a destroyed renderer', async () => {
    const target = createTarget()
    const throttle = new RendererPublicationThrottle()

    const release = throttle.acquire(target)
    target.destroyed = true
    release()
    await vi.runOnlyPendingTimersAsync()
    expect(target.capturePage).not.toHaveBeenCalled()

    expect(target.calls).toEqual([false])
  })
})
