// Official-build constants are evaluated at import time. This suite isolates
// those constants while exercising the real SDK through an injected transport.

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

vi.hoisted(() => {
  const g = globalThis as { ORCA_BUILD_IDENTITY?: string; ORCA_POSTHOG_WRITE_KEY?: string }
  g.ORCA_BUILD_IDENTITY = 'stable'
  g.ORCA_POSTHOG_WRITE_KEY = 'phc-bw-transport-test'
})

import type { TelemetryTransport } from './client'
import type * as TelemetryClient from './client'
import type { createPostHogClient } from './posthog-transport'
import {
  makeFakeSettings,
  makeFakeStore,
  stashAndClearConsentEnv,
  restoreConsentEnv,
  BASE_COMMON
} from './client-test-harness'
import type { GlobalSettings } from '../../shared/settings/global-settings-types'

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
        typeof body === 'string'
          ? body.length
          : body instanceof Uint8Array
            ? body.byteLength
            : body
              ? (await body.arrayBuffer()).byteLength
              : 0
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

const { nativeFetch } = vi.hoisted(() => ({ nativeFetch: vi.fn() }))
vi.mock('../network/http-client', () => ({
  getMainHttpClient: () => ({ fetch: nativeFetch })
}))

describe('Workbench WeLink telemetry transport under official-build identity', () => {
  let client: typeof TelemetryClient
  let createClient: MockInstance<typeof createPostHogClient>
  let envStash: Record<string, string | undefined>
  const networkFetch = vi.fn(async () => new Response('{"status":1}', { status: 200 }))

  beforeEach(async () => {
    vi.resetModules()
    envStash = stashAndClearConsentEnv()
    vi.stubEnv('ORCA_PRODUCT_NAME', 'Workbench')
    // A failed transport gate must fail the assertions without contacting PostHog.
    networkFetch.mockClear()
    nativeFetch.mockReset()
    vi.stubGlobal('fetch', networkFetch)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const transportModule = await import('./posthog-transport')
    vi.spyOn(transportModule, 'buildCommonProps').mockReturnValue(BASE_COMMON)
    createClient = vi.spyOn(transportModule, 'createPostHogClient')
    client = await import('./client')
  })

  afterEach(() => {
    client._resetWorkbenchTelemetryTransportForTests()
    client._setStoreForTests(null)
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
    client.setWorkbenchTelemetryTransport(spy.transport)

    client.initTelemetry(storeWith(optedInTelemetry), (start) => start())
    client.trackAppOpenedOnce()
    await client.shutdownTelemetry()

    expect(spy.shutdown).toHaveBeenCalledOnce()
    const batch = spy.calls.find((call) => call.url.includes('/batch'))
    expect(
      batch,
      `expected a /batch/ flush, got ${JSON.stringify(spy.calls.map((c) => c.url))}`
    ).toBeDefined()
    expect(batch!.bodyBytes).toBeGreaterThan(0)
    expect(networkFetch).not.toHaveBeenCalled()
    expect(nativeFetch).not.toHaveBeenCalled()
  })

  it('fails closed without an injected transport: init builds no client even under official constants', async () => {
    client.initTelemetry(storeWith(optedInTelemetry), (start) => start())
    client.trackAppOpenedOnce()
    await client.shutdownTelemetry()

    expect(createClient).not.toHaveBeenCalled()
    expect(networkFetch).not.toHaveBeenCalled()
    expect(nativeFetch).not.toHaveBeenCalled()
  })

  it('transmits nothing while consent is off (the BW default)', async () => {
    const spy = makeTransportSpy()
    client.setWorkbenchTelemetryTransport(spy.transport)

    client.initTelemetry(storeWith({ ...optedInTelemetry, optedIn: false }), (start) => start())
    client.trackAppOpenedOnce()
    await client.shutdownTelemetry()

    expect(spy.calls.find((call) => call.url.includes('/batch'))).toBeUndefined()
    expect(networkFetch).not.toHaveBeenCalled()
    expect(nativeFetch).not.toHaveBeenCalled()
  })
})
