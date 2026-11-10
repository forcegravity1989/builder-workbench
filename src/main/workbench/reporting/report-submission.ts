// WeLink group-space sink for the three BW reporting channels (Issue #553
// 第一件事): user feedback, crash reports (both via submitWelinkReport) and
// the diagnostics-pane bundle (submitWelinkDiagnosticsBundle /
// deleteWelinkDiagnosticsBundle). Replaces the native onorca.dev HTTP POST —
// single sink, no product branch (AGENTS 不留双路径).
//
// Delivery contract mirrors the native result shapes so preload/renderer
// need zero changes: FeedbackSubmitResult for the feedback/crash lane,
// {ticketId} for the diagnostics pane (ticketId = bundleSubmissionId, whose
// [A-Za-z0-9_-]{16,64} shape the IPC layer already validates), thrown
// Error messages surface verbatim in the pane's toasts.
//
// File layout in the group space (folder「Workbench 上报」):
//   workbench-<channel>-<yyyyMMdd-HHmmss>-<id8>.md      report (metadata + text)
//   workbench-<channel>-…-<id8>-image-<n>.<ext>         feedback screenshots
//   workbench-diagnostics-<bundleSubmissionId>.ndjson   redacted trace bundle
// Unique names avoid the same-name version-overwrite trap (max 3 versions,
// 调研 §5); the diagnostics name is deterministic so retries dedupe by MD5
// and deletion can relocate the file after an app restart.

import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { withSpan } from '../../observability/tracer'
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
  findReportFileIdByName,
  removeReportFile,
  uploadReportFile,
  WelinkReportError,
  type WelinkRoute
} from './welink-onebox-client'

const GENERIC_FAILURE_MESSAGE = '发送失败,请稍后重试。'
const DIAGNOSTICS_NOT_FOUND_MESSAGE = '群空间中未找到该诊断文件,可能已被删除。'

// Bounded like the skill-observability precedent: counts/bytes are closed
// vocabulary, everything free-form stays in the redacted exit cause.
const MAX_OBSERVED_BYTES = 64 * 1024 * 1024

function boundedBytes(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), MAX_OBSERVED_BYTES) : 0
}

export function diagnosticsBundleFileName(bundleSubmissionId: string): string {
  return `workbench-diagnostics-${bundleSubmissionId}.ndjson`
}

async function resolveWelinkRoute(): Promise<WelinkRoute> {
  // Cached per app session by preflight; the first caller pays the probe.
  // Presence is a routing fact (where is the CLI), not an auth gate — auth
  // failures surface from the actual attempt (更正后调研 §7:先尝试、失败再给指引).
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
  const identity = body.githubLogin ? `${body.githubLogin} <${body.githubEmail ?? ''}>` : '匿名'
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
        rmSync(directory, { recursive: true, force: true })
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
      const directory = join(getReportingTempRoot(), `diagnostics-${bundleSubmissionId}`)
      mkdirSync(directory, { mode: 0o700, recursive: true })
      try {
        const filePath = writeTextFile(directory, fileName, payload)
        await uploadReportFile(route, config.spaceId, folderId, filePath, fileName)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
      // ticketId stays the bundleSubmissionId: renderer contract (copy
      // reference / delete by id) is unchanged, and the deterministic file
      // name lets deletion relocate the file even after a restart.
      return { ticketId: bundleSubmissionId }
    } catch (error) {
      span.setAttribute('status', 'failed')
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

/** Diagnostics pane「删除已发送诊断」: relocate by deterministic name, then recycle. */
export async function deleteWelinkDiagnosticsBundle(ticketId: string): Promise<void> {
  return withSpan('workbench.reporting.diagnostics', async (span) => {
    span.setAttribute('op', 'delete')
    const config = resolveWelinkReportConfig()
    if (!config) {
      span.setAttribute('status', 'failed')
      span.setAttribute('errorCode', 'config-missing')
      span.fail('WORKBENCH_WELINK_SPACE_ID not configured')
      throw new Error(WELINK_REPORT_CONFIG_MISSING_MESSAGE)
    }
    try {
      const route = await resolveWelinkRoute()
      const folderId = await ensureReportFolder(route, config.spaceId)
      const fileName = diagnosticsBundleFileName(ticketId)
      const fileId = await findReportFileIdByName(route, config.spaceId, folderId, fileName)
      if (!fileId) {
        span.setAttribute('status', 'failed')
        span.setAttribute('errorCode', 'not-found')
        span.fail(`diagnostics file not found in group space: ${fileName}`)
        throw new Error(DIAGNOSTICS_NOT_FOUND_MESSAGE)
      }
      await removeReportFile(route, config.spaceId, fileId)
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
