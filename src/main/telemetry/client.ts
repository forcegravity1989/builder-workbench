// Main-process telemetry transport: one posthog-node client, one `track()` entry that every
// event (main + IPC) funnels through. The ordering inside `track()` — shutdown gate, burst cap,
// consent, validator, capture — MUST be preserved: burst cap runs before consent so a compromised
// opted-out renderer can't force a settings read per event.
// `$process_person_profile: false` is attached per capture because posthog-node has no init-time
// equivalent of posthog-js's `person_profiles: 'identified_only'` (no PostHog person per install_id).

import { randomUUID } from 'node:crypto'
import { arch as osArch, platform as osPlatform, release as osRelease } from 'node:os'
import { getAppEnvironment } from '../../shared/app-environment'
import { PostHog, type PostHogOptions } from 'posthog-node'
import type { CommonProps, EventName, EventProps, OptInVia } from '../../shared/telemetry-events'
import type { Store } from '../persistence'
import { isWorkbenchProduct } from '../startup/workbench-product'
import { consumeBurstToken, resetBurstCapsForSession } from './burst-cap'
import { getCohortAtEmit } from './cohort-classifier'
import { resolveConsent, type ConsentState } from './consent'
import { commonPropsSchema, validate } from './validator'

// Compile-time kill switch for both native and injected transports.
// NOTE: config/scripts/verify-telemetry-constants.mjs greps `const TELEMETRY_ENABLED = true|false`; keep that shape or update its regex.
const TELEMETRY_ENABLED = true

// Native PostHog transmission requires both CI-injected identity and key, with no runtime override.
// The `globalThis` reads are for vitest, which skips electron-vite's `define` pass — resolving to `IS_OFFICIAL_BUILD === false` there.
const BUILD_IDENTITY: 'stable' | 'rc' | null =
  typeof ORCA_BUILD_IDENTITY !== 'undefined'
    ? ORCA_BUILD_IDENTITY
    : ((globalThis as { ORCA_BUILD_IDENTITY?: 'stable' | 'rc' | null }).ORCA_BUILD_IDENTITY ?? null)
const WRITE_KEY: string | null =
  typeof ORCA_POSTHOG_WRITE_KEY !== 'undefined'
    ? ORCA_POSTHOG_WRITE_KEY
    : ((globalThis as { ORCA_POSTHOG_WRITE_KEY?: string | null }).ORCA_POSTHOG_WRITE_KEY ?? null)
const IS_OFFICIAL_BUILD: boolean =
  (BUILD_IDENTITY === 'stable' || BUILD_IDENTITY === 'rc') &&
  typeof WRITE_KEY === 'string' &&
  WRITE_KEY.length > 0

// Module-level singletons — one Store / process / telemetry session; threading `store` everywhere buys nothing.
let posthog: PostHog | null = null
let sessionId: string | null = null
let commonProps: CommonProps | null = null
let shuttingDown = false
let storeRef: Store | null = null

const OPT_OUT_CAPTURE_ENQUEUE_TIMEOUT_MS = 1_000
const SHUTDOWN_BUDGET_MS = 2_000

// Test-only transport-gate override (`_enableTransportForTests`) so tests exercise the full pipeline without a real CI build.
let testTransportEnabled = false

// First-launch `app_opened` gate: no events transmit until the banner resolves; keep mark+emit atomic.
let appOpenedTrackedThisSession = false

// The bootstrap injects BW's destination without importing the workbench layer here.
export type TelemetryTransportFetchResponse = {
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

export type TelemetryTransport = {
  /** Acknowledge buffered batches with 2xx; the transport owns upload retries. */
  fetch: (
    url: string,
    options: { method: string; headers: Record<string, string>; body?: string | Blob }
  ) => Promise<TelemetryTransportFetchResponse>
  /** Final flush within the native client's remaining quit budget. */
  shutdown?: (remainingMs: number) => Promise<void>
}

let workbenchTransport: TelemetryTransport | null = null

/** BW bootstrap hook — call before `initTelemetry` (see `TelemetryTransport`). */
export function setWorkbenchTelemetryTransport(transport: TelemetryTransport): void {
  workbenchTransport = transport
}

export function _resetWorkbenchTelemetryTransportForTests(): void {
  workbenchTransport = null
}

// Placeholder only: the BW transport never touches the network, but the SDK
// constructor requires a non-empty key.
const WORKBENCH_TRANSPORT_WRITE_KEY = 'workbench-welink-transport'

function buildCommonProps(installId: string, sid: string, channel: 'stable' | 'rc'): CommonProps {
  // Don't truncate here; the validator's `.max(64)` is authoritative, so an over-long string drops rather than being silently masked.
  return {
    app_version: getAppEnvironment().getVersion(),
    platform: osPlatform(),
    arch: osArch(),
    os_release: osRelease(),
    install_id: installId,
    session_id: sid,
    orca_channel: channel
  }
}

export function initTelemetry(store: Store): void {
  // Set unconditionally so `setOptIn` can persist opt-out to disk even on contributor / non-official builds.
  storeRef = store
  resetBurstCapsForSession()
  shuttingDown = false
  // Reset per session: the "no app_opened until banner resolution" invariant is per-launch, not per-install.
  appOpenedTrackedThisSession = false

  if (!TELEMETRY_ENABLED) {
    return
  }
  // BW must never fall through to the official PostHog transport.
  if (isWorkbenchProduct()) {
    const bwTransport = workbenchTransport
    if (!bwTransport) {
      return
    }
    initTelemetryTransport(store, {
      channel: 'stable', // BW builds inject no ORCA_BUILD_IDENTITY; the sink is not channel-routed.
      writeKey: WORKBENCH_TRANSPORT_WRITE_KEY,
      fetch: bwTransport.fetch
    })
    return
  }

  if (!IS_OFFICIAL_BUILD) {
    return
  }
  initTelemetryTransport(store, {
    // Non-null here: `IS_OFFICIAL_BUILD` gated this branch to the `'stable' | 'rc'` arm.
    channel: BUILD_IDENTITY as 'stable' | 'rc',
    writeKey: WRITE_KEY as string
  })
}

function initTelemetryTransport(
  store: Store,
  opts: {
    channel: 'stable' | 'rc'
    writeKey: string
    fetch?: PostHogOptions['fetch']
  }
): void {
  const settings = store.getSettings()
  const installId = settings.telemetry?.installId
  if (!installId) {
    // Migration guarantees installId; if missing, don't transmit with an absent distinct_id.
    console.warn('[telemetry] installId missing after migration; skipping transport init')
    return
  }

  sessionId = randomUUID()
  commonProps = buildCommonProps(installId, sessionId, opts.channel)

  // Fail-closed: a bad `install_id` (e.g. empty from a migration bug) would collapse all events into one distinct_id.
  // Validated once here (not per `track()`): `commonProps` is a session-lifetime singleton that can't drift.
  const parsedCommon = commonPropsSchema.safeParse(commonProps)
  if (!parsedCommon.success) {
    console.warn('[telemetry] common props failed schema validation; skipping transport init')
    commonProps = null
    return
  }

  posthog = new PostHog(opts.writeKey, {
    host: 'https://us.i.posthog.com',
    flushAt: 20,
    flushInterval: 10_000,
    // Strip SDK-auto GeoIP / client-IP enrichment; our wire is exactly CommonProps ∪ EventProps ∪ a small allow-list.
    disableGeoip: true,
    // Bumped from the default 1000 (drops oldest-first past cap) to 5000 to tolerate long-offline sessions.
    maxQueueSize: 5000,
    ...(opts.fetch ? { fetch: opts.fetch } : {})
  })

  if (shouldOptOutSdkAtInit(resolveConsent(settings))) {
    posthog.optOut()
  }
}

/**
 * Whether to flip the PostHog SDK's in-memory `optedOut` flag at boot.
 *
 * True for DISABLED cohorts only, re-applied every boot (the flag doesn't persist) so any direct
 * `posthog.capture()` bypassing `track()` still drops for an opted-out user. Deliberately excludes
 * `pending_banner`: the direct `telemetry_opted_out` capture in `setOptIn(_, false)` must not drop,
 * or we'd lose the one signal that the opt-out flow works.
 */
export function shouldOptOutSdkAtInit(consent: ConsentState): boolean {
  return consent.effective === 'disabled'
}

function waitForCaptureEnqueue(client: PostHog, event: EventName, uuid: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let stopListening: (() => void) | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null

    const settle = (enqueued: boolean): void => {
      if (settled) {
        return
      }
      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      stopListening?.()
      resolve(enqueued)
    }

    // Why: posthog-node capture() enqueues async; this SDK event is the durable boundary before optOut().
    stopListening = client.on('capture', (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        return
      }
      const message = payload as { event?: unknown; uuid?: unknown }
      if (message.event === event && message.uuid === uuid) {
        settle(true)
      }
    })

    timeout = setTimeout(() => settle(false), OPT_OUT_CAPTURE_ENQUEUE_TIMEOUT_MS)
  })
}

// Native builds require official credentials; BW requires its injected transport.
export function track<N extends EventName>(name: N, props: EventProps<N>): void {
  const transportAllowed =
    TELEMETRY_ENABLED && (isWorkbenchProduct() ? workbenchTransport !== null : IS_OFFICIAL_BUILD)
  if (!testTransportEnabled && !transportAllowed) {
    return
  }

  // (1) Shutdown gate: late IPC arrivals must not enqueue against a flushing client.
  if (shuttingDown) {
    return
  }
  if (!posthog || !commonProps || !storeRef) {
    return
  }

  // (2) Burst cap before consent: the O(1) cap drops floods before the costly settings read, so a compromised opted-out renderer can't burn CPU.
  if (!consumeBurstToken(name)) {
    return
  }

  // (3) Consent resolve — reads live settings every call so it can't drift from persisted state / env-var precedence.
  const consent = resolveConsent(storeRef.getSettings())
  if (consent.effective !== 'enabled') {
    return
  }

  // (4) Validator — single enforcement point for schema, enum, key set, and length caps.
  const result = validate(name, props)
  if (!result.ok) {
    return
  }

  // (5) Capture. `$process_person_profile: false` stops posthog-node creating a person per install_id (no init-time equivalent).
  posthog.capture({
    distinctId: commonProps.install_id,
    event: name,
    properties: {
      ...commonProps,
      ...result.props,
      $process_person_profile: false
    }
  })
}

export async function setOptIn(via: OptInVia, optedIn: boolean): Promise<void> {
  if (!storeRef) {
    return
  }
  const settings = storeRef.getSettings()
  const telemetryBeforeUpdate = settings.telemetry
  const wasPendingBanner =
    telemetryBeforeUpdate?.existedBeforeTelemetryRelease === true &&
    telemetryBeforeUpdate.optedIn === null
  // Deep-merge (persistence.ts:552) so flipping `optedIn` won't clobber `installId` / `existedBeforeTelemetryRelease`.
  storeRef.updateSettings({
    telemetry: {
      ...(settings.telemetry ?? { installId: '', existedBeforeTelemetryRelease: true }),
      optedIn
    }
  })

  const client = posthog
  if (optedIn) {
    if (client) {
      await client.optIn()
    }
    if (wasPendingBanner) {
      trackAppOpenedOnce()
    }
    track('telemetry_opted_in', { via })
  } else {
    if (!client) {
      return
    }
    // Fire before disabling the SDK — the one event that must transmit against the new preference. Capture directly (not
    // `track()`, which would drop it on `user_opt_out`); await enqueue since posthog-node captures async and must confirm before optOut().
    try {
      if (!shuttingDown && commonProps && consumeBurstToken('telemetry_opted_out')) {
        const validated = validate('telemetry_opted_out', { via })
        if (validated.ok) {
          const uuid = randomUUID()
          const enqueued = waitForCaptureEnqueue(client, 'telemetry_opted_out', uuid)
          client.capture({
            distinctId: commonProps.install_id,
            event: 'telemetry_opted_out',
            uuid,
            properties: {
              ...commonProps,
              ...validated.props,
              $process_person_profile: false
            }
          })
          if (!(await enqueued)) {
            console.warn('[telemetry] telemetry_opted_out did not enqueue before SDK opt-out')
          }
        }
      }
    } catch (err) {
      console.warn('[telemetry] telemetry_opted_out capture failed before SDK opt-out:', err)
    } finally {
      await client.optOut()
    }
  }
}

// Banner ✕: silent persisted opt-in. Separate from `setOptIn` because that always emits a
// `telemetry_opted_in/out` event; here `app_opened` fires but no opt-in event does. Don't add a
// `via`/emit param — give a new silent-opt-in surface its own named function.
export async function persistBannerAcknowledgeWithoutEmitting(): Promise<void> {
  if (!storeRef) {
    return
  }
  const settings = storeRef.getSettings()
  // Fallback only used if the `telemetry` block is absent (migration invariant broken); updateSettings deep-merges it (persistence.ts:560).
  storeRef.updateSettings({
    telemetry: {
      ...(settings.telemetry ?? { installId: '', existedBeforeTelemetryRelease: true }),
      optedIn: true
    }
  })
  if (posthog) {
    await posthog.optIn()
  }
  // Why: banner resolution is the first eligible moment for app_opened; SDK re-enabled above so capture sees the new consent.
  trackAppOpenedOnce()
}

export function trackAppOpenedOnce(): void {
  if (appOpenedTrackedThisSession) {
    return
  }
  appOpenedTrackedThisSession = true
  // Why: `nth_repo_added: 0` marks the session-zero / pre-repo cohort. See docs/onboarding-funnel-cohort-addendum.md.
  track('app_opened', { ...getCohortAtEmit() })
}

export async function shutdownTelemetry(): Promise<void> {
  // Set the gate before flush so late IPC-arrived tracks drop instead of enqueuing mid-flush.
  shuttingDown = true
  const deadline = Date.now() + SHUTDOWN_BUDGET_MS
  const instance = posthog
  if (instance) {
    try {
      await instance.shutdown(SHUTDOWN_BUDGET_MS)
    } catch (err) {
      // Telemetry must never crash the app on quit. Swallow.
      console.warn('[telemetry] shutdown error (ignored):', err)
    }
  }
  // SDK buffering and the destination share one quit deadline.
  if (workbenchTransport?.shutdown) {
    try {
      await workbenchTransport.shutdown(Math.max(0, deadline - Date.now()))
    } catch (err) {
      console.warn('[telemetry] workbench transport shutdown error (ignored):', err)
    }
  }
}

// Test-only introspection: `_`-prefixed helpers inject a fake PostHog and observe captures; not a runtime API.

export function _setPostHogClientForTests(client: PostHog | null): void {
  posthog = client
}

export function _setCommonPropsForTests(props: CommonProps | null): void {
  commonProps = props
}

export function _setStoreForTests(store: Store | null): void {
  storeRef = store
}

export function _setShuttingDownForTests(value: boolean): void {
  shuttingDown = value
}

export function _enableTransportForTests(enabled: boolean): void {
  testTransportEnabled = enabled
}

export function _resetFirstAppOpenedFiredForTests(): void {
  appOpenedTrackedThisSession = false
}
