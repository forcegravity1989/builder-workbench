// The SDK's fetch acknowledges buffered batches; this sink owns upload retries.
// Group-space uploads are less frequent than SDK flushes because each creates a file.

import { gunzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TelemetryTransportFetchResponse } from '../../telemetry/client'
import { withSpan } from '../../observability/tracer'
import { resolveWelinkReportConfig, WORKBENCH_TELEMETRY_FOLDER_NAME } from './welink-report-config'
import { ensureReportFolder, uploadReportFile, WelinkReportError } from './welink-onebox-client'
import {
  cleanupReportingTemp,
  getReportingTempRoot,
  resolveWelinkRoute,
  submissionStamp
} from './report-submission'

// Match the native SDK queue limit, dropping the oldest events first.
const MAX_BUFFERED_EVENTS = 5_000

const DEFAULT_FLUSH_INTERVAL_MS = 600_000

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
let closed = false

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
  if (!closed) {
    buffer = [...events, ...buffer].slice(-MAX_BUFFERED_EVENTS)
  }
}

/** Upload one buffered batch as a single ndjson file; re-queues on any failure. */
export function flushTelemetryBuffer(): Promise<void> {
  if (closed) {
    return Promise.resolve()
  }
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
        const { spaceId } = resolveWelinkReportConfig()
        const route = await resolveWelinkRoute()
        if (closed) {
          span.interrupt('telemetry shutdown')
          return
        }
        const folderId = await ensureReportFolder(route, spaceId, WORKBENCH_TELEMETRY_FOLDER_NAME)
        if (closed) {
          span.interrupt('telemetry shutdown')
          return
        }
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
          cleanupReportingTemp(directory, span)
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

/** Share the native client's remaining quit budget; unsent events are discarded. */
export async function shutdownTelemetryTransport(remainingMs: number): Promise<void> {
  stopped = true
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (remainingMs <= 0 || (!flushInFlight && buffer.length === 0)) {
    closed = true
    buffer = []
    return
  }
  const expiresAt = Date.now() + remainingMs
  const inFlight = flushInFlight
  const flushFinalBatch = async (): Promise<void> => {
    if (inFlight) {
      await inFlight
    }
    if (!closed && Date.now() < expiresAt && buffer.length > 0) {
      await flushTelemetryBuffer()
    }
  }
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      flushFinalBatch(),
      new Promise<void>((resolve) => {
        deadline = setTimeout(resolve, remainingMs)
      })
    ])
  } finally {
    closed = true
    buffer = []
    if (deadline) {
      clearTimeout(deadline)
    }
  }
}

async function readRequestBody(body: string | Blob | undefined): Promise<string> {
  // A rejected fetch can leave the SDK retrying after shutdown; malformed bodies are dropped.
  try {
    if (typeof body === 'string') {
      return body
    }
    if (body && typeof body.text === 'function') {
      const raw = Buffer.from(await body.arrayBuffer())
      // posthog-node sends gzip Blob bodies; plain JSON remains valid.
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
 * posthog-node custom fetch acknowledges batches without starting SDK retries.
 * Only the capture batch endpoint is buffered; any other SDK request
 * (none expected — flags/personalApiKey are off) is acked and ignored.
 */
export async function transportFetch(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string | Blob }
): Promise<TelemetryTransportFetchResponse> {
  if (!stopped && options.method === 'POST' && url.includes('/batch')) {
    const events = parsePostHogBatchText(await readRequestBody(options.body))
    if (!stopped && events.length > 0) {
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
  closed = false
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  flushInFlight = null
}
