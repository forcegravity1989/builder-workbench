import { readFileSync, writeFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectedBundle } from '../observability/bundle'
import type * as NodeFs from 'node:fs'

const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => unknown>()

const {
  handleMock,
  mkdirSyncMock,
  readFileSyncMock,
  writeFileSyncMock,
  showMessageBoxMock,
  openPathMock,
  collectDiagnosticBundleMock,
  deleteWelinkBundleMock,
  getDiagnosticsStatusMock,
  submitWelinkBundleMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  showMessageBoxMock: vi.fn(),
  openPathMock: vi.fn(),
  collectDiagnosticBundleMock: vi.fn(),
  deleteWelinkBundleMock: vi.fn(),
  getDiagnosticsStatusMock: vi.fn(),
  submitWelinkBundleMock: vi.fn()
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return {
    ...actual,
    mkdirSync: mkdirSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock
  }
})

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getVersion: () => '1.2.3-test' },
  dialog: { showMessageBox: showMessageBoxMock },
  ipcMain: { handle: handleMock },
  shell: { openPath: openPathMock }
}))

vi.mock('../observability', () => ({
  collectDiagnosticBundle: collectDiagnosticBundleMock,
  getDiagnosticsStatus: getDiagnosticsStatusMock
}))

// BW #553: upload/delete ride the WeLink group-space sink; the IPC contract
// (ticketId / thrown user-facing messages) is what these cases pin.
vi.mock('../workbench/reporting/report-submission', () => ({
  submitWelinkDiagnosticsBundle: submitWelinkBundleMock,
  deleteWelinkDiagnosticsBundle: deleteWelinkBundleMock
}))

import { registerDiagnosticsHandlers } from './diagnostics'

function captureHandlers(): void {
  handlers.clear()
  for (const call of handleMock.mock.calls) {
    const [channel, handler] = call as [
      string,
      typeof handlers extends Map<string, infer V> ? V : never
    ]
    handlers.set(channel, handler)
  }
}

function makeBundle(overrides: Partial<CollectedBundle> = {}): CollectedBundle {
  return {
    bundleSubmissionId: 'abcdefghijklmnopqrstuv',
    payload: '{"type":"bundle-header"}\n',
    bytes: 25,
    spanCount: 0,
    ...overrides
  }
}

describe('diagnostics IPC handlers', () => {
  beforeEach(() => {
    handleMock.mockReset()
    mkdirSyncMock.mockReset()
    readFileSyncMock.mockReset()
    writeFileSyncMock.mockReset()
    showMessageBoxMock.mockReset()
    showMessageBoxMock.mockResolvedValue({ response: 0 })
    openPathMock.mockReset()
    openPathMock.mockResolvedValue('')
    collectDiagnosticBundleMock.mockReset()
    deleteWelinkBundleMock.mockReset()
    getDiagnosticsStatusMock.mockReset()
    submitWelinkBundleMock.mockReset()
    delete (globalThis as { ORCA_BUILD_IDENTITY?: unknown }).ORCA_BUILD_IDENTITY
    getDiagnosticsStatusMock.mockReturnValue({
      localFileEnabled: true,
      bundleEnabled: true,
      traceFilePath: '/tmp/main.trace.ndjson',
      traceFamilySize: 0
    })
    collectDiagnosticBundleMock.mockReturnValue(makeBundle())
    readFileSyncMock.mockReturnValue(makeBundle().payload)
    submitWelinkBundleMock.mockImplementation(
      async (_payload: string, bundleSubmissionId: string) => ({
        ticketId: bundleSubmissionId
      })
    )
    deleteWelinkBundleMock.mockResolvedValue(undefined)
    registerDiagnosticsHandlers()
    captureHandlers()
  })

  it('rejects upload without a main-collected bundle preview', async () => {
    const upload = handlers.get('diagnostics:uploadBundle')!
    await expect(upload({}, 'rendererMintedBundleId')).rejects.toThrow(/expired/)
    expect(submitWelinkBundleMock).not.toHaveBeenCalled()
  })

  it('uploads only the payload retained by main after collection', async () => {
    const bundle = makeBundle({
      bundleSubmissionId: 'bundleabcdefghijklmnop',
      payload: '{"type":"bundle-header"}\n{"safe":true}\n'
    })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    readFileSyncMock.mockReturnValue(bundle.payload)
    const collect = handlers.get('diagnostics:collectBundle')!
    const openPreview = handlers.get('diagnostics:openBundlePreview')!
    const upload = handlers.get('diagnostics:uploadBundle')!

    await collect({}, 30)
    await openPreview({}, bundle.bundleSubmissionId)
    await expect(upload({}, bundle.bundleSubmissionId)).resolves.toEqual({
      ticketId: bundle.bundleSubmissionId
    })

    expect(submitWelinkBundleMock).toHaveBeenCalledWith(bundle.payload, bundle.bundleSubmissionId)
  })

  it('returns a quiet cancellation when the user declines upload confirmation', async () => {
    const bundle = makeBundle({ bundleSubmissionId: 'bundleabcdefghijklmnop' })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    const collect = handlers.get('diagnostics:collectBundle')!
    const openPreview = handlers.get('diagnostics:openBundlePreview')!
    const upload = handlers.get('diagnostics:uploadBundle')!

    await collect({}, 30)
    await openPreview({}, bundle.bundleSubmissionId)
    await expect(upload({}, bundle.bundleSubmissionId)).resolves.toEqual({ canceled: true })
    expect(showMessageBoxMock).toHaveBeenCalledTimes(1)
    expect(submitWelinkBundleMock).not.toHaveBeenCalled()
  })

  it('rechecks the retained preview after upload confirmation', async () => {
    const bundle = makeBundle({ bundleSubmissionId: 'bundleabcdefghijklmnop' })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    const collect = handlers.get('diagnostics:collectBundle')!
    const openPreview = handlers.get('diagnostics:openBundlePreview')!
    const discard = handlers.get('diagnostics:discardBundlePreview')!
    const upload = handlers.get('diagnostics:uploadBundle')!
    showMessageBoxMock.mockImplementation(async () => {
      await discard({}, bundle.bundleSubmissionId)
      return { response: 0 }
    })

    await collect({}, 30)
    await openPreview({}, bundle.bundleSubmissionId)
    await expect(upload({}, bundle.bundleSubmissionId)).rejects.toThrow(/expired/)

    expect(submitWelinkBundleMock).not.toHaveBeenCalled()
  })

  it('ignores edited preview file contents and uploads the retained original payload', async () => {
    const bundle = makeBundle({
      bundleSubmissionId: 'bundleabcdefghijklmnop',
      payload: '{"original":true}\n'
    })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    readFileSyncMock.mockReturnValue('{"edited":true}\n')
    const collect = handlers.get('diagnostics:collectBundle')!
    const openPreview = handlers.get('diagnostics:openBundlePreview')!
    const upload = handlers.get('diagnostics:uploadBundle')!

    await collect({}, 30)
    await openPreview({}, bundle.bundleSubmissionId)
    await upload({}, bundle.bundleSubmissionId)

    expect(readFileSync).not.toHaveBeenCalled()
    expect(submitWelinkBundleMock).toHaveBeenCalledWith(
      '{"original":true}\n',
      bundle.bundleSubmissionId
    )
  })

  it('opens the retained bundle preview file through main', async () => {
    const bundle = makeBundle({ bundleSubmissionId: 'bundleabcdefghijklmnop' })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    const collect = handlers.get('diagnostics:collectBundle')!
    const openPreview = handlers.get('diagnostics:openBundlePreview')!

    await collect({}, 30)
    await openPreview({}, bundle.bundleSubmissionId)

    expect(openPathMock).toHaveBeenCalledWith(
      expect.stringContaining(`${bundle.bundleSubmissionId}.ndjson`)
    )
  })

  it('requires opening the retained review file before sending', async () => {
    const bundle = makeBundle({ bundleSubmissionId: 'bundleabcdefghijklmnop' })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    const collect = handlers.get('diagnostics:collectBundle')!
    const upload = handlers.get('diagnostics:uploadBundle')!

    await collect({}, 30)
    await expect(upload({}, bundle.bundleSubmissionId)).rejects.toThrow(/open.*review file/)
    expect(submitWelinkBundleMock).not.toHaveBeenCalled()
  })

  it('discards retained bundle previews on request', async () => {
    const bundle = makeBundle({ bundleSubmissionId: 'bundleabcdefghijklmnop' })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    const collect = handlers.get('diagnostics:collectBundle')!
    const discard = handlers.get('diagnostics:discardBundlePreview')!
    const upload = handlers.get('diagnostics:uploadBundle')!

    await collect({}, 30)
    await discard({}, bundle.bundleSubmissionId)

    await expect(upload({}, bundle.bundleSubmissionId)).rejects.toThrow(/expired/)
  })

  it('expires retained bundle previews without another diagnostics call', async () => {
    vi.useFakeTimers()
    try {
      const bundle = makeBundle({ bundleSubmissionId: 'bundleabcdefghijklmnop' })
      collectDiagnosticBundleMock.mockReturnValue(bundle)
      const collect = handlers.get('diagnostics:collectBundle')!
      const upload = handlers.get('diagnostics:uploadBundle')!

      await collect({}, 30)
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 1)

      await expect(upload({}, bundle.bundleSubmissionId)).rejects.toThrow(/expired/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes retained preview files with private permissions', async () => {
    const bundle = makeBundle({ bundleSubmissionId: 'bundleabcdefghijklmnop' })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    const collect = handlers.get('diagnostics:collectBundle')!

    await collect({}, 30)

    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.any(String), {
      mode: 0o700,
      recursive: true
    })
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(`${bundle.bundleSubmissionId}.ndjson`),
      bundle.payload,
      { encoding: 'utf8', mode: 0o600 }
    )
  })

  it('returns only bundle metadata from collection', async () => {
    const bundle = makeBundle({
      bundleSubmissionId: 'bundleabcdefghijklmnop',
      payload: '{"type":"bundle-header"}\n{"safe":true}\n',
      bytes: 37,
      spanCount: 1
    })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    const collect = handlers.get('diagnostics:collectBundle')!

    expect(collect({}, 30)).toEqual({
      bundleSubmissionId: bundle.bundleSubmissionId,
      bytes: bundle.bytes,
      spanCount: bundle.spanCount
    })
  })

  it('does not expose retained bundle payloads through collection IPC', async () => {
    const bundle = makeBundle({
      bundleSubmissionId: 'bundleabcdefghijklmnop',
      payload: '{"secret":"retained in main"}\n'
    })
    collectDiagnosticBundleMock.mockReturnValue(bundle)
    const collect = handlers.get('diagnostics:collectBundle')!

    const preview = await collect({}, 30)
    expect(JSON.stringify(preview)).not.toContain('retained in main')
  })

  it('allows crash-report lookbacks beyond 24 hours while bounding abuse', async () => {
    const collect = handlers.get('diagnostics:collectBundle')!
    await collect({}, 3 * 24 * 60)
    expect(collectDiagnosticBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({ lookbackMinutes: 3 * 24 * 60 })
    )
  })

  it('registers and handles bundle deletion by ticket ID', async () => {
    const deleteBundle = handlers.get('diagnostics:deleteBundle')!
    await deleteBundle({}, 'ticketabcdefghijklmnop')
    expect(deleteWelinkBundleMock).toHaveBeenCalledWith('ticketabcdefghijklmnop')
  })
})
