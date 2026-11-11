// BW #553(决策⑧ 修订)transport tests with REAL official-build constants.
// Why a separate file: IS_OFFICIAL_BUILD is a module-level const evaluated at
// import time, so globalThis injection must happen before the client module
// loads — vi.hoisted does that, but would flip every other case in
// client-lifecycle.test.ts (several rely on the non-official drop).
//
// Contract under test: with an injected WeLink transport the whole native
// pipeline (init → consent → burst cap → validator → SDK capture → flush)
// stays live and events reach the transport's fetch; without injection the
// Workbench product fails closed (no client, no capture); with consent off
// (the BW default) nothing transmits. These run WITHOUT the harness's
// `_enableTransportForTests` bypass so the gate itself is discriminating.

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
  BASE_COMMON
} from './client-test-harness'
import type { GlobalSettings } from '../../shared/global-settings-types'

const CONSENT_ENV_VARS = ['DO_NOT_TRACK', 'ORCA_TELEMETRY_DISABLED', 'CI'] as const

function stashConsentEnv(): Record<string, string | undefined> {
  const stash: Record<string, string | undefined> = {}
  for (const name of CONSENT_ENV_VARS) {
    stash[name] = process.env[name]
    delete process.env[name]
  }
  return stash
}

function restoreConsentEnv(stash: Record<string, string | undefined>): void {
  for (const name of CONSENT_ENV_VARS) {
    if (stash[name] === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = stash[name]
    }
  }
}

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

  beforeEach(() => {
    envStash = stashConsentEnv()
    process.env.ORCA_PRODUCT_NAME = 'Workbench'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    _resetWorkbenchTelemetryTransportForTests()
    _setPostHogClientForTests(null)
    _setCommonPropsForTests(null)
    _setStoreForTests(null)
    _setShuttingDownForTests(false)
    delete process.env.ORCA_PRODUCT_NAME
    restoreConsentEnv(envStash)
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

    // Discriminating: without the BW transport branch in initTelemetry, no
    // PostHog client would exist and the SDK would never reach the spy fetch.
    expect(spy.shutdown).toHaveBeenCalledOnce()
    const batch = spy.calls.find((call) => call.url.includes('/batch'))
    expect(
      batch,
      `expected a /batch/ flush, got ${JSON.stringify(spy.calls.map((c) => c.url))}`
    ).toBeDefined()
    expect(batch!.bodyBytes).toBeGreaterThan(0)
  })

  it('fails closed without an injected transport: init builds no client even under official constants', async () => {
    // Mock-survival pattern (前作 gate 测试的判别式设计): seed the module with
    // the harness mock, then run init. If the BW init gate regressed, the
    // native branch — live under this file's hoisted official constants — would
    // instantiate a REAL PostHog client, replace the mock, and flush over the
    // network on shutdown. Gate intact → the mock survives and shutdown stays
    // sealed (no client built, no capture, no fetch).
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
  })

  it('transmits nothing while consent is off (the BW default)', async () => {
    const spy = makeTransportSpy()
    setWorkbenchTelemetryTransport(spy.transport)

    initTelemetry(storeWith({ ...optedInTelemetry, optedIn: false }))
    trackAppOpenedOnce()
    await shutdownTelemetry()

    expect(spy.calls.find((call) => call.url.includes('/batch'))).toBeUndefined()
  })
})
