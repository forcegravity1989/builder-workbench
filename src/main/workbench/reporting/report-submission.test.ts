import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedbackSubmitBody } from '../../ipc/feedback'
import type * as oneboxClientModule from './welink-onebox-client'

const {
  ensureReportFolderMock,
  uploadReportFileMock,
  removeReportFileMock,
  runPreflightCheckMock,
  getCanonicalUserDataPathMock
} = vi.hoisted(() => ({
  ensureReportFolderMock: vi.fn(),
  uploadReportFileMock: vi.fn(),
  removeReportFileMock: vi.fn(),
  runPreflightCheckMock: vi.fn(),
  getCanonicalUserDataPathMock: vi.fn()
}))

vi.mock('electron', async () => {
  const os = await import('node:os')
  return { app: { getPath: () => os.tmpdir() } }
})

vi.mock('../../preflight/agent-detection', () => ({
  runPreflightCheck: runPreflightCheckMock
}))

vi.mock('../../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: getCanonicalUserDataPathMock
}))

vi.mock('./welink-onebox-client', async (importOriginal) => {
  const actual = await importOriginal<typeof oneboxClientModule>()
  return {
    ...actual,
    ensureReportFolder: ensureReportFolderMock,
    uploadReportFile: uploadReportFileMock,
    removeReportFile: removeReportFileMock
  }
})

import {
  deleteWelinkDiagnosticsBundle,
  diagnosticsBundleFileName,
  submitWelinkDiagnosticsBundle,
  submitWelinkReport
} from './report-submission'
import { WelinkReportError } from './welink-onebox-client'

function body(overrides: Partial<FeedbackSubmitBody> = {}): FeedbackSubmitBody {
  return {
    feedback: 'FULL-TEXT 完整反馈正文',
    submissionType: 'feedback',
    githubLogin: null,
    githubEmail: null,
    appVersion: '9.9.9-test',
    platform: 'win32',
    osRelease: '10.0.0',
    arch: 'x64',
    ...overrides
  }
}

let uploadedReportContent = ''
let lastUploadDir = ''
let testUserData = ''

beforeEach(() => {
  testUserData = mkdtempSync(join(tmpdir(), 'bw-report-receipt-'))
  getCanonicalUserDataPathMock.mockReturnValue(testUserData)
  uploadedReportContent = ''
  lastUploadDir = ''
  ensureReportFolderMock.mockReset()
  uploadReportFileMock.mockReset()
  removeReportFileMock.mockReset()
  runPreflightCheckMock.mockReset()
  runPreflightCheckMock.mockResolvedValue({ welink: { installed: true, authenticated: true } })
  ensureReportFolderMock.mockResolvedValue('555')
  uploadReportFileMock.mockResolvedValue('777')
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(testUserData, { recursive: true, force: true })
})

describe('submitWelinkReport orchestration', () => {
  it('degrades upload failures to partial-delivery results with categorized copy and keeps the diagnostics ticket contract', async () => {
    uploadReportFileMock.mockImplementation(
      async (
        _route: unknown,
        _space: string,
        _folder: string,
        filePath: string,
        fileName: string
      ) => {
        lastUploadDir = dirname(filePath)
        if (fileName.endsWith('.ndjson')) {
          throw new WelinkReportError('rate-limit', 'status 429 Frequency Control')
        }
        if (fileName.includes('-image-')) {
          throw new WelinkReportError('network', 'dial tcp: i/o timeout')
        }
        // Read the report while the temp file still exists (cleanup runs after).
        uploadedReportContent = readFileSync(filePath, 'utf8')
        return '777'
      }
    )

    const result = await submitWelinkReport(
      body({
        submissionType: 'crash',
        feedback: 'FULL-TEXT',
        diagnosticBundle: {
          bundleSubmissionId: 'bundleabcdefghijklmnop',
          content: '{"type":"bundle-header"}\n',
          bytes: 25,
          spanCount: 1
        },
        images: [{ contentType: 'image/png', data: new Uint8Array([1, 2, 3]) }]
      }),
      'REPORT-ONLY-TEXT'
    )

    // Text landed → ok:true, with both partial-failure fields set (native
    // contract the crash dialog and feedback toasts already decode).
    expect(result).toEqual({
      ok: true,
      diagnosticBundleFailure: { status: null, error: 'WeLink 接口限流,请稍后重试。' },
      imagesDelivered: false
    })
    // Bundle upload failed → the report ships the report-only text and says so.
    expect(uploadedReportContent).toContain('REPORT-ONLY-TEXT')
    expect(uploadedReportContent).not.toContain('FULL-TEXT')
    expect(uploadedReportContent).toContain('附件上传失败')
    expect(uploadedReportContent).toContain('bundleabcdefghijklmnop')
    // Temp staging is cleaned even on partial failure.
    expect(existsSync(lastUploadDir)).toBe(false)

    uploadReportFileMock.mockImplementation(
      async (
        _route: unknown,
        _space: string,
        _folder: string,
        filePath: string,
        fileName: string
      ) => {
        lastUploadDir = dirname(filePath)
        if (fileName.endsWith('.md')) {
          throw new WelinkReportError('network', 'dial tcp: lookup open.inner: ENOTFOUND')
        }
        return '777'
      }
    )
    const failed = await submitWelinkReport(body())
    expect(failed).toEqual({
      ok: false,
      status: null,
      error: '无法访问 WeLink 内网接口(上报仅内网可达);请检查网络后重试。'
    })
    expect(existsSync(lastUploadDir)).toBe(false)

    await expect(deleteWelinkDiagnosticsBundle('diagsubmissionid000001')).rejects.toThrow(
      '未找到本机发送记录'
    )
    uploadReportFileMock.mockResolvedValue('777')
    runPreflightCheckMock.mockResolvedValue({ welink: { installed: true, wslDistro: 'Ubuntu' } })
    await expect(
      submitWelinkDiagnosticsBundle('{"type":"bundle-header"}\n', 'diagsubmissionid000001')
    ).resolves.toEqual({ ticketId: 'diagsubmissionid000001' })
    expect(uploadReportFileMock).toHaveBeenLastCalledWith(
      expect.anything(),
      '24160277',
      '555',
      expect.stringContaining(diagnosticsBundleFileName('diagsubmissionid000001')),
      diagnosticsBundleFileName('diagsubmissionid000001')
    )
    const receiptPath = join(
      testUserData,
      'workbench-diagnostic-receipts',
      'diagsubmissionid000001.json'
    )
    expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toEqual({
      spaceId: '24160277',
      fileId: '777',
      route: { wslDistro: 'Ubuntu' }
    })
    // A new module instance must recover the deletion target from the on-disk
    // receipt alone (space is code-pinned): no preflight probe, no folder lookup.
    runPreflightCheckMock.mockClear()
    ensureReportFolderMock.mockClear()
    vi.resetModules()
    const reloaded = await import('./report-submission')
    await expect(
      reloaded.deleteWelinkDiagnosticsBundle('diagsubmissionid000001')
    ).resolves.toBeUndefined()
    expect(removeReportFileMock).toHaveBeenCalledWith({ wslDistro: 'Ubuntu' }, '24160277', '777')
    expect(runPreflightCheckMock).not.toHaveBeenCalled()
    expect(ensureReportFolderMock).not.toHaveBeenCalled()
    expect(existsSync(receiptPath)).toBe(false)
  })
})
