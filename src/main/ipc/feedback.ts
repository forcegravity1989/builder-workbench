import os from 'node:os'
import { app, ipcMain } from 'electron'
import { validateFeedbackImages, type FeedbackImageAttachment } from './feedback-image-attachments'
import { submitWelinkReport } from '../workbench/reporting/report-submission'

export type { FeedbackImageAttachment }

// Why (BW #553): feedback and crash reports deliver to the WeLink group
// space through welink-cli onebox — the native onorca.dev HTTP transport
// (net.fetch + multipart + endpoint retries) is removed, not branched:
// single sink, no dual path (AGENTS 硬约束). Transport, failure
// classification and file packaging live in src/main/workbench/reporting/.

export type FeedbackSubmissionType = 'feedback' | 'crash'

export type FeedbackSubmitArgs = {
  feedback: string
  submitAnonymously?: boolean
  githubLogin: string | null
  githubEmail: string | null
  images?: FeedbackImageAttachment[]
}

export type FeedbackDiagnosticBundleAttachment = {
  bundleSubmissionId: string
  content: string
  bytes: number
  spanCount: number
}

export type FeedbackSubmitBody = {
  feedback: string
  submissionType: FeedbackSubmissionType
  githubLogin: string | null
  githubEmail: string | null
  appVersion: string
  platform: NodeJS.Platform
  osRelease: string
  arch: string
  diagnosticBundle?: FeedbackDiagnosticBundleAttachment
  images?: FeedbackImageAttachment[]
}

export type FeedbackRequestFailure = {
  status: number | null
  error: string
}

export type FeedbackSubmitResult =
  | {
      ok: true
      diagnosticBundleFailure?: FeedbackRequestFailure
      /** Absent when nothing was attached; false when the text landed but the images did not. */
      imagesDelivered?: boolean
    }
  | ({ ok: false } & FeedbackRequestFailure & {
        diagnosticBundleFailure?: FeedbackRequestFailure
      })

type InternalFeedbackSubmitArgs = FeedbackSubmitArgs & {
  submissionType?: FeedbackSubmissionType
  diagnosticBundle?: FeedbackDiagnosticBundleAttachment
  feedbackWithoutDiagnosticBundle?: string
}

// Why: triage in the WeLink group space needs to know which Workbench build
// and which OS the report came from. The main process is the only place with
// trusted access to these values (app.getVersion and the node os module), so
// we enrich the payload here rather than trusting the renderer.
function buildSubmitBody(args: InternalFeedbackSubmitArgs): FeedbackSubmitBody {
  const identity = args.submitAnonymously
    ? { githubLogin: null, githubEmail: null }
    : { githubLogin: args.githubLogin, githubEmail: args.githubEmail }

  // Why: anonymity is an IPC-only privacy decision. Allow-list fields here so
  // stale renderer state or future identity-shaped fields cannot leak upstream.
  return {
    feedback: args.feedback,
    submissionType: args.submissionType ?? 'feedback',
    ...identity,
    appVersion: app.getVersion(),
    platform: process.platform,
    osRelease: os.release(),
    arch: process.arch,
    ...(args.submissionType === 'crash' && args.diagnosticBundle
      ? { diagnosticBundle: args.diagnosticBundle }
      : {}),
    // Why: images are a feedback-only affordance; crash reports already carry
    // diagnostic bundles and never attach screenshots.
    ...(args.submissionType !== 'crash' && args.images?.length ? { images: args.images } : {})
  }
}

export async function submitFeedback(
  args: InternalFeedbackSubmitArgs
): Promise<FeedbackSubmitResult> {
  // Why: buildSubmitBody drops images on the crash lane, so validating them
  // there would abort a crash report over attachments it never meant to send.
  if (args.submissionType !== 'crash' && args.images !== undefined) {
    const imageError = validateFeedbackImages(args.images)
    if (imageError) {
      return { ok: false, status: null, error: imageError }
    }
  }
  const body = buildSubmitBody(args)
  return submitWelinkReport(body, args.feedbackWithoutDiagnosticBundle)
}

export function registerFeedbackHandlers(): void {
  ipcMain.removeHandler('feedback:submit')
  ipcMain.handle('feedback:submit', (_event, args: FeedbackSubmitArgs) => {
    // Why: validate the raw clone before normalization so a tiny hostile value
    // cannot become a large main-process typed-array allocation.
    if (args.images !== undefined) {
      const imageError = validateFeedbackImages(args.images)
      if (imageError) {
        return { ok: false, status: null, error: imageError }
      }
    }
    // Why: crash submissions are main-only. A compromised renderer can invoke
    // this channel directly, so force the public feedback lane at the boundary.
    return submitFeedback({
      ...args,
      submissionType: 'feedback'
    })
  })
}
