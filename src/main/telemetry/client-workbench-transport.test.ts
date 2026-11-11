// Official-build constants are evaluated at import time. This suite isolates
// those constants while exercising the real SDK through an injected transport.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  const g = globalThis as { ORCA_BUILD_IDENTITY?: string; ORCA_POSTHOG_WRITE_KEY?: string }
  g.ORCA_BUILD_IDENTITY = 'stable'
  g.ORCA_POSTHOG_WRITE_KEY = 'phc-bw-transport-test'
})

import type { PostHog } from 'posthog-node'
import {
  _resetWorkbenchTelemetryTransportForTests,
  _setCommonPropsForTests,
  _setPostHogClientForTests,
  _setShuttingDownForTests,
  _setStoreForTests,
  initTelemetry,
  setWorkbenchTelemetryTransport,
  shutdownTelemetry,
  trackAppOpenedOnce,
  type TelemetryTransport
} from './client'
import {
  makeFakeSettings,
  makeFakeStore,
  makeMockPostHog,
  stashAndClearConsentEnv,
  restoreConsentEnv,
  BASE_COMMON
} from './client-test-harness'
import type { GlobalSettings } from '../../shared/global-settings-types'

type TransportSpy = {
  calls: { url: string; bodyBytes: number }[]
  shutdown: ReturnType<typeof vi.fn>
  transport: TelemetryTransport
}

function makeTransportSpy(): TransportSpy {
  const calls: { url: string; bodyBytes: number }[] = []
  const shutdown = vi.fn(async () => {})
  const transport: TelemetryTransport = {
    shutdown,
    fetch: async (url, options) => {
      const body = options.body
      const bodyBytes =
        typeof body === 'string' ? body.length : body ? (await body.arrayBuffer()).byteLength : 0
      calls.push({ url, bodyBytes })
      return {
        status: 200,
        text: async () => '{"status":1}',
        json: async () => ({ status: 1 })
      }
    }
  }
  return { calls, shutdown, transport }
}

describe('Workbench WeLink telemetry transport under official-build identity', () => {
  let envStash: Record<string, string | undefined>
  const networkFetch = vi.fn(async () => new Response('{"status":1}', { status: 200 }))

  beforeEach(() => {
    envStash = stashAndClearConsentEnv()
    vi.stubEnv('ORCA_PRODUCT_NAME', 'Workbench')
    // A failed transport gate must fail the assertions without contacting PostHog.
    networkFetch.mockClear()
    vi.stubGlobal('fetch', networkFetch)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    _resetWorkbenchTelemetryTransportForTests()
    _setPostHogClientForTests(null)
    _setCommonPropsForTests(null)
    _setStoreForTests(null)
    _setShuttingDownForTests(false)
    restoreConsentEnv(envStash)
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function storeWith(telemetry: GlobalSettings['telemetry']): ReturnType<typeof makeFakeStore> {
    return makeFakeStore(makeFakeSettings(telemetry))
  }

  const optedInTelemetry: GlobalSettings['telemetry'] = {
    optedIn: true,
    installId: BASE_COMMON.install_id,
    existedBeforeTelemetryRelease: false
  }

  it('routes opted-in events through the injected transport and flushes them on shutdown', async () => {
    const spy = makeTransportSpy()
    setWorkbenchTelemetryTransport(spy.transport)

    initTelemetry(storeWith(optedInTelemetry))
    trackAppOpenedOnce()
    await shutdownTelemetry()

    expect(spy.shutdown).toHaveBeenCalledOnce()
    const batch = spy.calls.find((call) => call.url.includes('/batch'))
    expect(
      batch,
      `expected a /batch/ flush, got ${JSON.stringify(spy.calls.map((c) => c.url))}`
    ).toBeDefined()
    expect(batch!.bodyBytes).toBeGreaterThan(0)
    expect(networkFetch).not.toHaveBeenCalled()
  })

  it('fails closed without an injected transport: init builds no client even under official constants', async () => {
    // An incorrect native fallback replaces this mock under the official constants.
    const mock = makeMockPostHog()
    _setPostHogClientForTests(mock as unknown as PostHog)
    _setCommonPropsForTests(BASE_COMMON)
    _setStoreForTests(storeWith(optedInTelemetry))
    _setShuttingDownForTests(false)

    initTelemetry(storeWith(optedInTelemetry))
    trackAppOpenedOnce()
    await shutdownTelemetry()

    expect(mock.shutdown).toHaveBeenCalledWith(2_000)
    expect(mock.capture).not.toHaveBeenCalled()
    expect(networkFetch).not.toHaveBeenCalled()
  })

  it('transmits nothing while consent is off (the BW default)', async () => {
    const spy = makeTransportSpy()
    setWorkbenchTelemetryTransport(spy.transport)

    initTelemetry(storeWith({ ...optedInTelemetry, optedIn: false }))
    trackAppOpenedOnce()
    await shutdownTelemetry()

    expect(spy.calls.find((call) => call.url.includes('/batch'))).toBeUndefined()
    expect(networkFetch).not.toHaveBeenCalled()
  })
})
