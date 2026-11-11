// BW #553(决策⑧ 修订):opt-in product telemetry lands in the WeLink group
// space instead of PostHog. This module is the `TelemetryTransport` the
// native telemetry client injects into posthog-node's custom `fetch`.
//
// Wire facts (spike-verified against posthog-node 5.33.3, no network):
//   - the SDK POSTs one gzip Blob body to `<host>/batch/` per flush
//     (`{api_key, batch: [{distinct_id, event, properties, timestamp, uuid}], sent_at}`);
//   - a custom fetch that THROWS becomes an unhandled rejection that escapes
//     `shutdownTelemetry`'s catch and can take the main process down;
//   - a non-2xx response schedules a retry that fires after shutdown.
// So `transportFetch` buffers and always resolves 200 — the buffer (not the
// SDK) owns retry semantics: failed uploads are re-queued and ride the next
// scheduled flush.
//
// Cadence: the SDK's 10s flushInterval only moves events into the in-memory
// buffer. Group-space uploads run on a much longer interval (default 10 min,
// env-overridable for acceptance runs) because onebox rate-limits with 429
// (~45s recovery, 调研 §4) and every upload creates a permanent file in the
// group space — per-SDK-flush uploads would spam both.

import { gunzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TelemetryTransportFetchResponse } from '../../telemetry/client'
import { withSpan } from '../../observability/tracer'
import { resolveWelinkReportConfig, WORKBENCH_TELEMETRY_FOLDER_NAME } from './welink-report-config'
import { ensureReportFolder, uploadReportFile, WelinkReportError } from './welink-onebox-client'
import { getReportingTempRoot, resolveWelinkRoute, submissionStamp } from './report-submission'

// Mirrors the native SDK maxQueueSize (client.ts): past the cap the oldest
// events drop first. ~400B/event average → ~2 MiB worst-case buffer.
const MAX_BUFFERED_EVENTS = 5_000

const DEFAULT_FLUSH_INTERVAL_MS = 600_000
// Quit must not wedge on a slow upload: the welink client's own 90s deadline
// is far beyond an acceptable exit delay. 8s covers the measured good-link
// upload (~3.1s for 4 MiB; telemetry batches are far smaller) with margin —
// missing this window drops at most one flush interval of opt-in events.
const SHUTDOWN_FLUSH_BUDGET_MS = 8_000

function resolveFlushIntervalMs(): number {
  const raw = Number(process.env.WORKBENCH_TELEMETRY_FLUSH_MS)
  return Number.isFinite(raw) && raw >= 1_000 ? Math.trunc(raw) : DEFAULT_FLUSH_INTERVAL_MS
}

export type TelemetryBatchEvent = {
  readonly distinct_id: string
  readonly event: string
  readonly properties: Record<string, unknown>
  readonly timestamp: string
  readonly uuid: string
}

/** Parse one gunzipped `/batch/` payload; unknown shapes yield [] (drop, never throw into the SDK). */
export function parsePostHogBatchText(text: string): TelemetryBatchEvent[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const batch = (parsed as { batch?: unknown })?.batch
  if (!Array.isArray(batch)) {
    return []
  }
  const events: TelemetryBatchEvent[] = []
  for (const entry of batch) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    if (typeof record.event !== 'string' || typeof record.distinct_id !== 'string') {
      continue
    }
    events.push({
      distinct_id: record.distinct_id,
      event: record.event,
      properties:
        record.properties && typeof record.properties === 'object'
          ? (record.properties as Record<string, unknown>)
          : {},
      timestamp: typeof record.timestamp === 'string' ? record.timestamp : '',
      uuid: typeof record.uuid === 'string' ? record.uuid : ''
    })
  }
  return events
}

/** Timestamp + randomness: same-name uploads would overwrite versions (max 3) in the group space. */
export function telemetryFileName(now: Date): string {
  return `workbench-telemetry-${submissionStamp(now)}-${randomBytes(4).toString('hex')}.ndjson`
}

export function serializeTelemetryNdjson(events: readonly TelemetryBatchEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

let buffer: TelemetryBatchEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let flushInFlight: Promise<void> | null = null
let stopped = false

function bufferEvents(events: TelemetryBatchEvent[]): void {
  buffer.push(...events)
  if (buffer.length > MAX_BUFFERED_EVENTS) {
    buffer = buffer.slice(buffer.length - MAX_BUFFERED_EVENTS)
  }
  ensureFlushTimer()
}

function ensureFlushTimer(): void {
  if (flushTimer || stopped) {
    return
  }
  flushTimer = setInterval(() => {
    void flushTelemetryBuffer()
  }, resolveFlushIntervalMs())
  // Never keep the process alive for telemetry.
  flushTimer.unref?.()
}

function takeBuffer(): TelemetryBatchEvent[] {
  const events = buffer
  buffer = []
  return events
}

function requeue(events: TelemetryBatchEvent[]): void {
  bufferEvents(events)
}

/** Upload one buffered batch as a single ndjson file; re-queues on any failure. */
export function flushTelemetryBuffer(): Promise<void> {
  if (flushInFlight) {
    return flushInFlight
  }
  flushInFlight = (async () => {
    if (buffer.length === 0) {
      return
    }
    const events = takeBuffer()
    await withSpan('workbench.reporting.telemetry', async (span) => {
      span.setAttribute('events', events.length)
      try {
        // Space id is code-pinned (WELINK_REPORT_SPACE_ID); resolveWelinkReportConfig
        // never returns null, so there is no config-missing path here — a missing
        // welink-cli surfaces from resolveWelinkRoute as a categorized failure below.
        const { spaceId } = resolveWelinkReportConfig()
        const route = await resolveWelinkRoute()
        const folderId = await ensureReportFolder(
          route,
          spaceId,
          WORKBENCH_TELEMETRY_FOLDER_NAME
        )
        const fileName = telemetryFileName(new Date())
        const directory = join(getReportingTempRoot(), `telemetry-${fileName}`)
        mkdirSync(directory, { mode: 0o700, recursive: true })
        try {
          const filePath = join(directory, fileName)
          writeFileSync(filePath, serializeTelemetryNdjson(events), {
            encoding: 'utf8',
            mode: 0o600
          })
          await uploadReportFile(route, spaceId, folderId, filePath, fileName)
        } finally {
          rmSync(directory, { recursive: true, force: true })
        }
      } catch (error) {
        span.setAttribute('status', 'failed')
        span.setAttribute(
          'errorCode',
          error instanceof WelinkReportError ? error.category : 'unexpected'
        )
        // Telemetry must never surface errors to the user; the span cause is
        // the diagnostic record (redacted by the tracer).
        span.fail(error instanceof Error ? error : String(error))
        requeue(events)
      }
    })
  })().finally(() => {
    flushInFlight = null
  })
  return flushInFlight
}

/** Quit path: one bounded final flush; whatever doesn't land in time is dropped. */
export async function shutdownTelemetryTransport(): Promise<void> {
  stopped = true
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (buffer.length === 0) {
    return
  }
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      flushTelemetryBuffer(),
      new Promise<void>((resolve) => {
        deadline = setTimeout(resolve, SHUTDOWN_FLUSH_BUDGET_MS)
      })
    ])
  } finally {
    if (deadline) {
      clearTimeout(deadline)
    }
  }
}

async function readRequestBody(body: string | Blob | undefined): Promise<string> {
  // Never reject (SDK contract — see header): every path, including a Blob
  // read failure, degrades to '' (the batch is dropped, telemetry never
  // crashes the process).
  try {
    if (typeof body === 'string') {
      return body
    }
    if (body && typeof body.text === 'function') {
      const raw = Buffer.from(await body.arrayBuffer())
      // The SDK sets Content-Encoding: gzip on the batch body (spike-verified).
      try {
        return gunzipSync(raw).toString('utf8')
      } catch {
        return raw.toString('utf8')
      }
    }
  } catch {
    return ''
  }
  return ''
}

function okResponse(): TelemetryTransportFetchResponse {
  return {
    status: 200,
    text: async () => '{"status":1}',
    json: async () => ({ status: 1 })
  }
}

/**
 * posthog-node custom fetch. Contract: never reject, always 2xx (see header).
 * Only the capture batch endpoint is buffered; any other SDK request
 * (none expected — flags/personalApiKey are off) is acked and ignored.
 */
export async function transportFetch(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string | Blob }
): Promise<TelemetryTransportFetchResponse> {
  if (options.method === 'POST' && url.includes('/batch')) {
    const events = parsePostHogBatchText(await readRequestBody(options.body))
    if (events.length > 0) {
      bufferEvents(events)
    }
  }
  return okResponse()
}

export function _getBufferedTelemetryEventsForTests(): readonly TelemetryBatchEvent[] {
  return buffer
}

export function _resetTelemetryTransportForTests(): void {
  buffer = []
  stopped = false
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  flushInFlight = null
}
