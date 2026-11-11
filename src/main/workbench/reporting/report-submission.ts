import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { withSpan, type ActiveSpan } from '../../observability/tracer'
import { runPreflightCheck } from '../../preflight/agent-detection'
import {
  FEEDBACK_IMAGE_EXTENSIONS,
  type FeedbackImageAttachment
} from '../../ipc/feedback-image-attachments'
import type {
  FeedbackRequestFailure,
  FeedbackSubmitBody,
  FeedbackSubmitResult
} from '../../ipc/feedback'
import {
  resolveWelinkReportConfig,
  WELINK_REPORT_CONFIG_MISSING_MESSAGE
} from './welink-report-config'
import {
  ensureReportFolder,
  removeReportFile,
  uploadReportFile,
  WelinkReportError,
  type WelinkRoute
} from './welink-onebox-client'
import {
  forgetDiagnosticUploadReceipt,
  readDiagnosticUploadReceipt,
  saveDiagnosticUploadReceipt
} from './diagnostic-upload-receipt'

const GENERIC_FAILURE_MESSAGE = '发送失败,请稍后重试。'
const DIAGNOSTICS_NOT_FOUND_MESSAGE = '未找到本机发送记录,请到 WeLink 群空间管理已发送的诊断文件。'

const MAX_OBSERVED_BYTES = 64 * 1024 * 1024

class ReceiptPersistenceError extends Error {}

function cleanupReportingTemp(directory: string, span: ActiveSpan): void {
  try {
    rmSync(directory, { recursive: true, force: true })
  } catch (error) {
    // Cleanup cannot turn an acknowledged upload into a retryable send failure.
    span.addEvent('temp-cleanup-failed')
    span.fail(error instanceof Error ? error : String(error))
  }
}

function boundedBytes(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), MAX_OBSERVED_BYTES) : 0
}

export function diagnosticsBundleFileName(bundleSubmissionId: string): string {
  return `workbench-diagnostics-${bundleSubmissionId}.ndjson`
}

async function resolveWelinkRoute(): Promise<WelinkRoute> {
  // Expired authentication can refresh during upload; only CLI presence gates the attempt.
  const status = await runPreflightCheck()
  if (!status.welink?.installed) {
    throw new WelinkReportError('not-installed', 'preflight reports welink-cli absent')
  }
  return status.welink.wslDistro ? { wslDistro: status.welink.wslDistro } : {}
}

function getReportingTempRoot(): string {
  let base: string
  try {
    base = app.getPath('temp')
  } catch {
    base = tmpdir()
  }
  return join(base, 'workbench-reporting')
}

function submissionBase(channel: 'feedback' | 'crash', now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `workbench-${channel}-${stamp}-${randomBytes(4).toString('hex')}`
}

export function buildReportMarkdown(
  body: FeedbackSubmitBody,
  submittedAt: string,
  bundleAttached: boolean
): string {
  const channel = body.submissionType === 'crash' ? '崩溃报告' : '用户反馈'
  const identity = body.githubLogin
    ? `${body.githubLogin} <${body.githubEmail ?? ''}>`
    : '未附带 GitHub 账号信息'
  const lines = [
    `# Workbench ${channel}`,
    '',
    `- submittedAt: ${submittedAt}`,
    `- appVersion: ${body.appVersion}`,
    `- platform: ${body.platform} (${body.arch})`,
    `- osRelease: ${body.osRelease}`,
    `- githubLogin: ${identity}`
  ]
  if (body.diagnosticBundle) {
    lines.push(
      `- diagnosticBundle: ${bundleAttached ? '已附同目录文件' : '附件上传失败,未随本报告送达'} ` +
        `(id=${body.diagnosticBundle.bundleSubmissionId}, bytes=${body.diagnosticBundle.bytes}, spans=${body.diagnosticBundle.spanCount})`
    )
  }
  lines.push('', '---', '', body.feedback, '')
  return lines.join('\n')
}

function writeTextFile(directory: string, fileName: string, content: string): string {
  const filePath = join(directory, fileName)
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 })
  return filePath
}

function writeImageFile(
  directory: string,
  fileName: string,
  image: FeedbackImageAttachment
): string {
  const filePath = join(directory, fileName)
  writeFileSync(filePath, Buffer.from(image.data), { mode: 0o600 })
  return filePath
}

function toRequestFailure(error: unknown): FeedbackRequestFailure {
  return {
    status: null,
    error: error instanceof WelinkReportError ? error.message : GENERIC_FAILURE_MESSAGE
  }
}

/** Feedback + crash lane. Never throws for transport failures — returns the mapped result. */
export async function submitWelinkReport(
  body: FeedbackSubmitBody,
  reportOnlyText?: string
): Promise<FeedbackSubmitResult> {
  return withSpan('workbench.reporting.submit', async (span) => {
    span.setAttribute('channel', body.submissionType)
    const config = resolveWelinkReportConfig()
    if (!config) {
      span.setAttribute('status', 'failed')
      span.setAttribute('errorCode', 'config-missing')
      span.fail('WORKBENCH_WELINK_SPACE_ID not configured')
      return { ok: false, status: null, error: WELINK_REPORT_CONFIG_MISSING_MESSAGE }
    }
    try {
      const route = await resolveWelinkRoute()
      const folderId = await ensureReportFolder(route, config.spaceId)
      const now = new Date()
      const base = submissionBase(body.submissionType, now)
      const directory = join(getReportingTempRoot(), base)
      mkdirSync(directory, { mode: 0o700, recursive: true })
      let uploadedFiles = 0
      try {
        // Bundle first: its outcome decides which report text ships (the
        // report-only variant embeds the not_uploaded reason natively).
        let diagnosticBundleFailure: FeedbackRequestFailure | undefined
        let bundleAttached = false
        if (body.diagnosticBundle) {
          const bundleName = diagnosticsBundleFileName(body.diagnosticBundle.bundleSubmissionId)
          const bundlePath = writeTextFile(directory, bundleName, body.diagnosticBundle.content)
          try {
            await uploadReportFile(route, config.spaceId, folderId, bundlePath, bundleName)
            bundleAttached = true
            uploadedFiles += 1
          } catch (error) {
            diagnosticBundleFailure = toRequestFailure(error)
            span.addEvent('bundle-upload-failed', {
              errorCode: error instanceof WelinkReportError ? error.category : 'unexpected'
            })
          }
        }
        const reportText =
          !bundleAttached && reportOnlyText !== undefined ? reportOnlyText : body.feedback
        const reportName = `${base}.md`
        const reportPath = writeTextFile(
          directory,
          reportName,
          buildReportMarkdown({ ...body, feedback: reportText }, now.toISOString(), bundleAttached)
        )
        await uploadReportFile(route, config.spaceId, folderId, reportPath, reportName)
        uploadedFiles += 1

        let imagesDelivered: boolean | undefined
        if (body.images?.length) {
          imagesDelivered = true
          for (const [index, image] of body.images.entries()) {
            const extension = FEEDBACK_IMAGE_EXTENSIONS[image.contentType] ?? 'png'
            const imageName = `${base}-image-${index + 1}.${extension}`
            try {
              const imagePath = writeImageFile(directory, imageName, image)
              await uploadReportFile(route, config.spaceId, folderId, imagePath, imageName)
              uploadedFiles += 1
            } catch {
              // Text landed; a missing screenshot degrades like the native
              // partial-delivery contract instead of failing the report.
              imagesDelivered = false
              span.addEvent('image-upload-failed', { index })
            }
          }
        }
        span.setAttribute('fileCount', uploadedFiles)
        if (diagnosticBundleFailure) {
          return {
            ok: true,
            diagnosticBundleFailure,
            ...(imagesDelivered !== undefined ? { imagesDelivered } : {})
          }
        }
        return { ok: true, ...(imagesDelivered !== undefined ? { imagesDelivered } : {}) }
      } finally {
        cleanupReportingTemp(directory, span)
      }
    } catch (error) {
      span.setAttribute('status', 'failed')
      if (error instanceof WelinkReportError) {
        span.setAttribute('errorCode', error.category)
        span.fail(error.detail)
        return { ok: false, status: null, error: error.message }
      }
      // Unexpected internal failure (fs, preflight, …): keep the span honest
      // with the real cause but hand the renderer the generic copy.
      span.setAttribute('errorCode', 'unexpected')
      span.fail(error instanceof Error ? error : String(error))
      return { ok: false, status: null, error: GENERIC_FAILURE_MESSAGE }
    }
  })
}

/** Diagnostics pane「发送」. Throws Error(userMessage) — the pane toasts it verbatim. */
export async function submitWelinkDiagnosticsBundle(
  payload: string,
  bundleSubmissionId: string
): Promise<{ ticketId: string }> {
  return withSpan('workbench.reporting.diagnostics', async (span) => {
    span.setAttribute('op', 'upload')
    span.setAttribute('bytes', boundedBytes(Buffer.byteLength(payload)))
    const config = resolveWelinkReportConfig()
    if (!config) {
      span.setAttribute('status', 'failed')
      span.setAttribute('errorCode', 'config-missing')
      span.fail('WORKBENCH_WELINK_SPACE_ID not configured')
      throw new Error(WELINK_REPORT_CONFIG_MISSING_MESSAGE)
    }
    const fileName = diagnosticsBundleFileName(bundleSubmissionId)
    try {
      const route = await resolveWelinkRoute()
      const folderId = await ensureReportFolder(route, config.spaceId)
      const directory = join(
        getReportingTempRoot(),
        `diagnostics-${bundleSubmissionId}-${randomBytes(4).toString('hex')}`
      )
      mkdirSync(directory, { mode: 0o700, recursive: true })
      try {
        const filePath = writeTextFile(directory, fileName, payload)
        const fileId = await uploadReportFile(route, config.spaceId, folderId, filePath, fileName)
        try {
          await saveDiagnosticUploadReceipt(bundleSubmissionId, {
            spaceId: config.spaceId,
            fileId,
            route
          })
        } catch (error) {
          // The CLI may deduplicate to an existing file; failed local persistence must not delete it.
          throw new ReceiptPersistenceError(
            '诊断文件已发送,但本机记录保存失败;请到 WeLink 群空间管理,并检查本地存储。',
            { cause: error }
          )
        }
      } finally {
        cleanupReportingTemp(directory, span)
      }
      return { ticketId: bundleSubmissionId }
    } catch (error) {
      span.setAttribute('status', 'failed')
      if (error instanceof ReceiptPersistenceError) {
        span.setAttribute('errorCode', 'receipt-write-failed')
        span.fail(error)
        throw error
      }
      if (error instanceof WelinkReportError) {
        span.setAttribute('errorCode', error.category)
        span.fail(error.detail)
        throw new Error(error.message)
      }
      span.setAttribute('errorCode', 'unexpected')
      span.fail(error instanceof Error ? error : String(error))
      throw new Error(GENERIC_FAILURE_MESSAGE)
    }
  })
}

/** Delete only the upload selected by main's durable receipt, never a renderer-provided file ID. */
export async function deleteWelinkDiagnosticsBundle(ticketId: string): Promise<void> {
  return withSpan('workbench.reporting.diagnostics', async (span) => {
    span.setAttribute('op', 'delete')
    try {
      const receipt = await readDiagnosticUploadReceipt(ticketId)
      if (!receipt) {
        span.setAttribute('status', 'failed')
        span.setAttribute('errorCode', 'not-found')
        span.fail('diagnostic upload receipt not found')
        throw new Error(DIAGNOSTICS_NOT_FOUND_MESSAGE)
      }
      await removeReportFile(receipt.route, receipt.spaceId, receipt.fileId)
      await forgetDiagnosticUploadReceipt(ticketId)
    } catch (error) {
      if (error instanceof WelinkReportError) {
        span.setAttribute('status', 'failed')
        span.setAttribute('errorCode', error.category)
        span.fail(error.detail)
        throw new Error(error.message)
      }
      if (error instanceof Error && error.message === DIAGNOSTICS_NOT_FOUND_MESSAGE) {
        throw error // span already marked at the throw site
      }
      span.setAttribute('status', 'failed')
      span.setAttribute('errorCode', 'unexpected')
      span.fail(error instanceof Error ? error : String(error))
      throw new Error(GENERIC_FAILURE_MESSAGE)
    }
  })
}
