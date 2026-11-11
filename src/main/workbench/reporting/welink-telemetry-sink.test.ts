// Batch, retry, shutdown and persisted-consent contracts for the WeLink transport.

import { gzipSync } from 'node:zlib'
import { dirname } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as oneboxClientModule from './welink-onebox-client'

const { ensureReportFolderMock, uploadReportFileMock, runPreflightCheckMock, cleanupProbeMock } =
  vi.hoisted(() => ({
    ensureReportFolderMock: vi.fn(),
    uploadReportFileMock: vi.fn(),
    runPreflightCheckMock: vi.fn(),
    cleanupProbeMock: vi.fn()
  }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      cleanupProbeMock(...args)
      actual.rmSync(...args)
    }
  }
})

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
  shutdownTelemetryTransport,
  telemetryFileName,
  transportFetch,
  type TelemetryBatchEvent
} from './welink-telemetry-sink'
import { applyWorkbenchTelemetryDefaultOff } from './telemetry-bootstrap'
import { WelinkReportError } from './welink-onebox-client'
import { WELINK_REPORT_SPACE_ID, WORKBENCH_TELEMETRY_FOLDER_NAME } from './welink-report-config'
import { makeFakeSettings, makeFakeStore } from '../../telemetry/client-test-harness'

function batchPayload(): string {
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

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

async function bufferBatch(body = batchPayload()): Promise<void> {
  await transportFetch('https://us.i.posthog.com/batch/', { method: 'POST', headers: {}, body })
}

beforeEach(() => {
  _resetTelemetryTransportForTests()
  ensureReportFolderMock.mockReset()
  uploadReportFileMock.mockReset()
  runPreflightCheckMock.mockReset()
  cleanupProbeMock.mockReset()
  runPreflightCheckMock.mockResolvedValue({ welink: { installed: true, authenticated: true } })
  ensureReportFolderMock.mockResolvedValue('555')
  uploadReportFileMock.mockResolvedValue('777')
})

afterEach(() => {
  _resetTelemetryTransportForTests()
  vi.useRealTimers()
})

describe('welink telemetry sink protocol', () => {
  it('decodes batches and keeps the newest events when an in-flight upload fails', async () => {
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

    const started = deferred<void>()
    const upload = deferred<string>()
    uploadReportFileMock.mockImplementationOnce(() => {
      started.resolve()
      return upload.promise
    })
    const flushing = flushTelemetryBuffer()
    await started.promise
    const newer = Array.from({ length: 5_000 }, (_, index) => ({
      distinct_id: 'i1',
      event: 'app_opened',
      uuid: `new-${index}`
    }))
    await bufferBatch(JSON.stringify({ batch: newer }))
    upload.reject(new WelinkReportError('network', 'offline'))
    await flushing
    expect(_getBufferedTelemetryEventsForTests()).toHaveLength(5_000)
    expect(_getBufferedTelemetryEventsForTests()[0].uuid).toBe('new-0')
    expect(_getBufferedTelemetryEventsForTests().at(-1)?.uuid).toBe('new-4999')
  })

  it('flushes the in-flight and final batches within the quit budget and preserves persisted choices', async () => {
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

    // Exercise the real shared cleanup helper: a filesystem failure cannot resend an acked batch.
    const uploadsBeforeCleanupFailure = uploadReportFileMock.mock.calls.length
    cleanupProbeMock.mockClear()
    cleanupProbeMock.mockImplementationOnce(() => {
      throw new Error('temporary directory is busy')
    })
    try {
      await bufferBatch()
      await flushTelemetryBuffer()
      expect(cleanupProbeMock).toHaveBeenCalledOnce()
      expect(_getBufferedTelemetryEventsForTests()).toHaveLength(0)
      await flushTelemetryBuffer()
      expect(uploadReportFileMock).toHaveBeenCalledTimes(uploadsBeforeCleanupFailure + 1)
    } finally {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
      const attemptedFile = uploadReportFileMock.mock.calls[uploadsBeforeCleanupFailure]?.[3]
      if (typeof attemptedFile === 'string') {
        actual.rmSync(dirname(attemptedFile), { recursive: true, force: true })
      }
    }

    // Quit must wait even when the entire buffer is already in flight.
    const started = deferred<void>()
    const upload = deferred<string>()
    uploadReportFileMock.mockImplementationOnce(() => {
      started.resolve()
      return upload.promise
    })
    await bufferBatch()
    const flushing = flushTelemetryBuffer()
    await started.promise
    let quitFinished = false
    const quitting = shutdownTelemetryTransport(2_000).then(() => {
      quitFinished = true
    })
    await Promise.resolve()
    expect(quitFinished).toBe(false)
    upload.resolve('778')
    await Promise.all([flushing, quitting])
    expect(quitFinished).toBe(true)

    // A batch queued by SDK shutdown behind an existing upload gets its own flush.
    _resetTelemetryTransportForTests()
    const tailStarted = deferred<void>()
    const priorUpload = deferred<string>()
    uploadReportFileMock.mockImplementationOnce(() => {
      tailStarted.resolve()
      return priorUpload.promise
    })
    await bufferBatch()
    const priorFlushing = flushTelemetryBuffer()
    await tailStarted.promise
    await bufferBatch()
    const uploadsBeforeQuit = uploadReportFileMock.mock.calls.length
    const withTail = shutdownTelemetryTransport(2_000)
    priorUpload.resolve('779')
    await Promise.all([priorFlushing, withTail])
    expect(uploadReportFileMock).toHaveBeenCalledTimes(uploadsBeforeQuit + 1)
    expect(_getBufferedTelemetryEventsForTests()).toHaveLength(0)

    // A timed-out upload must not resurrect the queue or start a tail upload later.
    _resetTelemetryTransportForTests()
    vi.useFakeTimers()
    const slowStarted = deferred<void>()
    const slowUpload = deferred<string>()
    uploadReportFileMock.mockImplementationOnce(() => {
      slowStarted.resolve()
      return slowUpload.promise
    })
    await bufferBatch()
    const slowFlushing = flushTelemetryBuffer()
    await slowStarted.promise
    await bufferBatch()
    const uploadsBeforeTimeout = uploadReportFileMock.mock.calls.length
    const timedQuit = shutdownTelemetryTransport(20)
    await vi.advanceTimersByTimeAsync(20)
    await timedQuit
    slowUpload.reject(new WelinkReportError('network', 'offline'))
    await slowFlushing
    await bufferBatch()
    expect(uploadReportFileMock).toHaveBeenCalledTimes(uploadsBeforeTimeout)
    expect(_getBufferedTelemetryEventsForTests()).toHaveLength(0)

    // Late discovery/metadata replies cannot start another stage after the quit deadline.
    for (const phase of ['preflight', 'folder'] as const) {
      _resetTelemetryTransportForTests()
      const phaseStarted = deferred<void>()
      const pendingPhase = deferred<unknown>()
      const phaseMock = phase === 'preflight' ? runPreflightCheckMock : ensureReportFolderMock
      phaseMock.mockImplementationOnce(() => {
        phaseStarted.resolve()
        return pendingPhase.promise
      })
      await bufferBatch()
      const pendingFlush = flushTelemetryBuffer()
      await phaseStarted.promise
      const callsAtDeadline = {
        preflight: runPreflightCheckMock.mock.calls.length,
        folder: ensureReportFolderMock.mock.calls.length,
        upload: uploadReportFileMock.mock.calls.length
      }
      const closing = shutdownTelemetryTransport(20)
      await vi.advanceTimersByTimeAsync(20)
      await closing
      pendingPhase.resolve(
        phase === 'preflight' ? { welink: { installed: true, authenticated: true } } : '555'
      )
      await pendingFlush
      await flushTelemetryBuffer()
      expect(runPreflightCheckMock).toHaveBeenCalledTimes(callsAtDeadline.preflight)
      expect(ensureReportFolderMock).toHaveBeenCalledTimes(callsAtDeadline.folder)
      expect(uploadReportFileMock).toHaveBeenCalledTimes(callsAtDeadline.upload)
      expect(_getBufferedTelemetryEventsForTests()).toHaveLength(0)
    }
    vi.useRealTimers()

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

    // Existing profiles start disabled once, including historical opted-in values.
    for (const optedIn of [true, null]) {
      const legacySettings = makeFakeSettings({
        optedIn,
        installId: 'id-2',
        existedBeforeTelemetryRelease: true
      })
      applyWorkbenchTelemetryDefaultOff(makeFakeStore(legacySettings))
      expect(legacySettings.telemetry).toMatchObject({
        optedIn: false,
        workbenchDefaultOffApplied: true
      })
    }

    // No telemetry block (migration invariant broken) → no write, no throw.
    const bareStore = makeFakeStore(makeFakeSettings(undefined))
    applyWorkbenchTelemetryDefaultOff(bareStore)
    expect(bareStore.updateSettings).not.toHaveBeenCalled()
  })
})
