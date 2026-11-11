// Wire-contract guards for the WeLink telemetry lane (BW #553 决策⑧ 修订):
//   1. posthog-node batch ingestion — gzip Blob body → buffered events, and
//      the never-reject/always-2xx fetch contract the SDK depends on;
//   2. group-space file protocol — ndjson serialization, unique names
//      (same-name uploads overwrite versions, max 3 — 调研 §5), re-queue on
//      failed upload;
//   3. default-off normalization — the native cohort migration defaults NEW
//      installs to opted-in, so the bootstrap flips untouched profiles once
//      (marker) and never overrides an explicit choice afterwards.
// A wrong parse silently drops every opted-in user's events; a wrong
// normalization either transmits without consent or reverts an opt-in —
// all three are data-protocol level, not UI assembly.
// Case count is merged per the ratchet offset rule (docs/development.md);
// all assertions from the pre-merge cases are preserved.

import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as oneboxClientModule from './welink-onebox-client'

const { ensureReportFolderMock, uploadReportFileMock, runPreflightCheckMock } = vi.hoisted(() => ({
  ensureReportFolderMock: vi.fn(),
  uploadReportFileMock: vi.fn(),
  runPreflightCheckMock: vi.fn()
}))

vi.mock('electron', async () => {
  const os = await import('node:os')
  return { app: { getPath: () => os.tmpdir() } }
})

vi.mock('../../preflight/agent-detection', () => ({
  runPreflightCheck: runPreflightCheckMock
}))

vi.mock('./welink-onebox-client', async (importOriginal) => {
  const actual = await importOriginal<typeof oneboxClientModule>()
  return {
    ...actual,
    ensureReportFolder: ensureReportFolderMock,
    uploadReportFile: uploadReportFileMock
  }
})

import {
  _getBufferedTelemetryEventsForTests,
  _resetTelemetryTransportForTests,
  flushTelemetryBuffer,
  parsePostHogBatchText,
  serializeTelemetryNdjson,
  telemetryFileName,
  transportFetch,
  type TelemetryBatchEvent
} from './welink-telemetry-sink'
import { applyWorkbenchTelemetryDefaultOff } from './telemetry-bootstrap'
import { WelinkReportError } from './welink-onebox-client'
import { WELINK_REPORT_SPACE_ID, WORKBENCH_TELEMETRY_FOLDER_NAME } from './welink-report-config'
import { makeFakeSettings, makeFakeStore } from '../../telemetry/client-test-harness'

function batchPayload(): string {
  // Verbatim shape from the posthog-node 5.33.3 spike (no network): one gzip
  // Blob POSTed to <host>/batch/ per flush.
  return JSON.stringify({
    api_key: 'workbench-welink-transport',
    batch: [
      {
        distinct_id: 'i1',
        event: 'app_opened',
        properties: { nth_repo_added: 0 },
        type: 'capture',
        timestamp: '2026-11-11T02:00:00.000Z',
        uuid: 'u-1'
      },
      { distinct_id: 'i1', event: 'telemetry_opted_in', properties: {}, uuid: 'u-2' },
      { malformed: true },
      'junk'
    ],
    sent_at: '2026-11-11T02:00:01.000Z'
  })
}

function gzipBlob(text: string): Blob {
  return new Blob([new Uint8Array(gzipSync(Buffer.from(text)))])
}

beforeEach(() => {
  _resetTelemetryTransportForTests()
  ensureReportFolderMock.mockReset()
  uploadReportFileMock.mockReset()
  runPreflightCheckMock.mockReset()
  runPreflightCheckMock.mockResolvedValue({ welink: { installed: true, authenticated: true } })
  ensureReportFolderMock.mockResolvedValue('555')
  uploadReportFileMock.mockResolvedValue('777')
})

afterEach(() => {
  _resetTelemetryTransportForTests()
})

describe('welink telemetry sink protocol', () => {
  it('buffers a gzipped /batch/ body, acks every request 2xx, and drops malformed entries', async () => {
    const response = await transportFetch('https://us.i.posthog.com/batch/', {
      method: 'POST',
      headers: { 'Content-Encoding': 'gzip' },
      body: gzipBlob(batchPayload())
    })
    expect(response.status).toBe(200)
    const buffered = _getBufferedTelemetryEventsForTests()
    expect(buffered).toHaveLength(2)
    expect(buffered[0]).toMatchObject({ event: 'app_opened', distinct_id: 'i1', uuid: 'u-1' })
    expect(buffered[0].properties).toEqual({ nth_repo_added: 0 })

    // Non-batch requests are acked and ignored (flags/personalApiKey are off,
    // but the SDK contract must never see a rejection).
    const other = await transportFetch('https://us.i.posthog.com/decide/', {
      method: 'POST',
      headers: {},
      body: 'not-json'
    })
    expect(other.status).toBe(200)
    expect(_getBufferedTelemetryEventsForTests()).toHaveLength(2)

    // Garbage batch bodies parse to [] instead of throwing into the SDK.
    expect(parsePostHogBatchText('{not json')).toEqual([])
    expect(parsePostHogBatchText('{"batch":"nope"}')).toEqual([])
  })

  it('flushes one uniquely-named ndjson file into the telemetry folder, re-queues on failure, and normalizes consent default-off once', async () => {
    await transportFetch('https://us.i.posthog.com/batch/', {
      method: 'POST',
      headers: {},
      body: batchPayload() // plain-string body path (no gzip header)
    })
    expect(_getBufferedTelemetryEventsForTests()).toHaveLength(2)

    // Failed upload: events ride the next flush instead of vanishing.
    uploadReportFileMock.mockRejectedValueOnce(new WelinkReportError('rate-limit', '429'))
    await flushTelemetryBuffer()
    expect(_getBufferedTelemetryEventsForTests()).toHaveLength(2)

    await flushTelemetryBuffer()
    expect(_getBufferedTelemetryEventsForTests()).toHaveLength(0)
    expect(ensureReportFolderMock).toHaveBeenCalledWith(
      expect.anything(),
      WELINK_REPORT_SPACE_ID,
      WORKBENCH_TELEMETRY_FOLDER_NAME
    )
    expect(uploadReportFileMock).toHaveBeenCalledTimes(2)
    const [, spaceId, folderId, filePath, fileName] = uploadReportFileMock.mock.calls[1]
    expect(spaceId).toBe(WELINK_REPORT_SPACE_ID)
    expect(folderId).toBe('555')
    expect(fileName).toMatch(/^workbench-telemetry-\d{8}-\d{6}-[0-9a-f]{8}\.ndjson$/)
    expect(filePath.endsWith(fileName)).toBe(true)
    // Same-name uploads overwrite versions in the group space (max 3) — names
    // must never collide, not even within the same second.
    expect(telemetryFileName(new Date())).not.toBe(telemetryFileName(new Date()))

    const events: TelemetryBatchEvent[] = parsePostHogBatchText(batchPayload())
    const lines = serializeTelemetryNdjson(events).trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toMatchObject({ event: 'app_opened', uuid: 'u-1' })

    // Default-off normalization (telemetry-bootstrap): new installs arrive
    // opted-in from the native cohort migration and must be flipped once.
    const freshSettings = makeFakeSettings({
      optedIn: true,
      installId: 'id-1',
      existedBeforeTelemetryRelease: false
    })
    const freshStore = makeFakeStore(freshSettings)
    applyWorkbenchTelemetryDefaultOff(freshStore)
    expect(freshSettings.telemetry).toMatchObject({
      optedIn: false,
      workbenchDefaultOffApplied: true,
      installId: 'id-1'
    })

    // With the marker set, a later explicit opt-in survives restarts.
    const chosenSettings = makeFakeSettings({
      optedIn: true,
      installId: 'id-1',
      existedBeforeTelemetryRelease: false,
      workbenchDefaultOffApplied: true
    })
    const chosenStore = makeFakeStore(chosenSettings)
    applyWorkbenchTelemetryDefaultOff(chosenStore)
    expect(chosenStore.updateSettings).not.toHaveBeenCalled()
    expect(chosenSettings.telemetry?.optedIn).toBe(true)

    // Existing-user cohort (pending banner, optedIn null) → off + marker.
    const legacySettings = makeFakeSettings({
      optedIn: null,
      installId: 'id-2',
      existedBeforeTelemetryRelease: true
    })
    applyWorkbenchTelemetryDefaultOff(makeFakeStore(legacySettings))
    expect(legacySettings.telemetry).toMatchObject({
      optedIn: false,
      workbenchDefaultOffApplied: true
    })

    // No telemetry block (migration invariant broken) → no write, no throw.
    const bareStore = makeFakeStore(makeFakeSettings(undefined))
    applyWorkbenchTelemetryDefaultOff(bareStore)
    expect(bareStore.updateSettings).not.toHaveBeenCalled()
  })
})
