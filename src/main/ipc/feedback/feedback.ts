import os from 'node:os'
import { app, ipcMain } from 'electron'
import { validateFeedbackImages } from './feedback-image-attachments'
import type {
  FeedbackSubmitArgs,
  FeedbackSubmitResult
} from '../../../shared/feedback/feedback-submit-contract'
import type {
  FeedbackDiagnosticBundleAttachment,
  FeedbackSubmissionType,
  FeedbackSubmitBody
} from './feedback-request'
import { submitWelinkReport } from '../../workbench/reporting/report-submission'

type InternalFeedbackSubmitArgs = FeedbackSubmitArgs & {
  submissionType?: FeedbackSubmissionType
  diagnosticBundle?: FeedbackDiagnosticBundleAttachment
  feedbackWithoutDiagnosticBundle?: string
}

// Enrich trusted build/OS identity in main rather than accepting renderer claims.
function buildSubmitBody(args: InternalFeedbackSubmitArgs): FeedbackSubmitBody {
  const identity = args.submitAnonymously
    ? { githubLogin: null, githubEmail: null }
    : { githubLogin: args.githubLogin, githubEmail: args.githubEmail }

  // Allow-list anonymous payloads so stale or future identity fields cannot leak upstream.
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
    // Server accepts images only for feedback; crash reports carry diagnostic bundles.
    ...(args.submissionType !== 'crash' && args.images?.length ? { images: args.images } : {})
  }
}

export async function submitFeedback(
  args: InternalFeedbackSubmitArgs
): Promise<FeedbackSubmitResult> {
  // Ignore discarded crash-lane images instead of rejecting over unused attachments.
  if (args.submissionType !== 'crash' && args.images !== undefined) {
    const imageError = validateFeedbackImages(args.images)
    if (imageError) {
      return { ok: false, status: null, error: imageError }
    }
  }
  return submitWelinkReport(buildSubmitBody(args), args.feedbackWithoutDiagnosticBundle)
}

export function registerFeedbackHandlers(): void {
  ipcMain.removeHandler('feedback:submit')
  ipcMain.handle('feedback:submit', (_event, args: FeedbackSubmitArgs) => {
    // Validate before typed-array normalization can expand hostile renderer input.
    if (args.images !== undefined) {
      const imageError = validateFeedbackImages(args.images)
      if (imageError) {
        return { ok: false, status: null, error: imageError }
      }
    }
    // Force the public feedback lane at IPC; crash submission is main-only.
    return submitFeedback({
      ...args,
      submissionType: 'feedback'
    })
  })
}
