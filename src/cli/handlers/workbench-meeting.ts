import type { CommandHandler, HandlerContext } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { getBrowserWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import {
  downloadTranscriptText,
  meetingDetailUrl,
  meetingSummaryUrl,
  transcriptExportUrl
} from '../workbench-meeting/api'
import { meetingOutputTarget, writeMeetingOutput } from '../workbench-meeting/output'
import { resolveMeetingSession } from '../workbench-meeting/session'

const meetingIdPattern = /^[A-F0-9]{32}$/

async function collectMeeting(ctx: HandlerContext): Promise<void> {
  const meetingId = getRequiredStringFlag(ctx.flags, 'meeting-id').toUpperCase()
  if (!meetingIdPattern.test(meetingId)) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--meeting-id 必须是 32 位十六进制 eMeeting ID。'
    )
  }
  const output = getRequiredStringFlag(ctx.flags, 'output')
  const worktree = await getBrowserWorktreeSelector(ctx.flags, ctx.cwd, ctx.client)
  if (!worktree) {
    throw new RuntimeClientError('invalid_argument', '请用 --worktree 指定当前项目的原生工作树。')
  }
  const outputTarget = await meetingOutputTarget(ctx, worktree, output)
  const { cookie, detail } = await resolveMeetingSession(meetingId)
  const transcript = await downloadTranscriptText(cookie, meetingId, detail)
  const sourceUrl = meetingSummaryUrl(meetingId)
  const result = {
    schemaVersion: 2,
    provider: 'emeeting',
    meetingId,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    worktree,
    meeting: {
      subject: detail.subject,
      startTime: detail.startTime,
      endTime: detail.endTime
    },
    endpoints: {
      detail: meetingDetailUrl(meetingId),
      transcript: transcriptExportUrl()
    },
    topics: detail.topics,
    transcript: {
      ...transcript,
      sourceRef: `${sourceUrl} · ${detail.subject}`
    }
  }
  await writeMeetingOutput(ctx, outputTarget, result)
  console.log(
    JSON.stringify(
      {
        ...result,
        transcript: {
          sourceRef: result.transcript.sourceRef,
          characters: result.transcript.characters,
          sha256: result.transcript.sha256
        },
        output
      },
      null,
      2
    )
  )
}

export const WORKBENCH_MEETING_HANDLERS: Record<string, CommandHandler> = {
  'bw meeting transcript': collectMeeting
}
