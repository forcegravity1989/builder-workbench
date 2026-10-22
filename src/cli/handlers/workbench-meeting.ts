import { z } from 'zod'
import type { BrowserEvalResult, BrowserTabShowResult } from '../../shared/runtime-types'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { getBrowserWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import { meetingPageExpression } from '../workbench-meeting/page'
import {
  MeetingRecordingSchema,
  selectMeetingRecordings,
  verifyTranscriptChunks,
  type MeetingRecording
} from '../workbench-meeting/protocol'
import { meetingOutputTarget, writeMeetingOutput } from '../workbench-meeting/output'

const PageReply = z
  .object({ error: z.string().optional(), message: z.string().optional() })
  .passthrough()
const Meta = z.object({
  ready: z.literal(true),
  title: z.string(),
  length: z.number().int().positive(),
  fingerprint: z.string()
})
const Inventory = z.object({ recordings: z.array(MeetingRecordingSchema) })
const delay = (milliseconds = 500) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
const titleMatches = (title: string, name: string) =>
  /^录制-\d+-\d+$/.test(name)
    ? (title.match(/录制-\d+-\d+/g) ?? []).some((value) => value === name)
    : title.includes(name)

async function collectMeeting(ctx: HandlerContext): Promise<void> {
  const meetingId = getRequiredStringFlag(ctx.flags, 'meeting-id').toUpperCase()
  if (!/^[A-F0-9]{32}$/.test(meetingId)) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--meeting-id 必须是 32 位十六进制 eMeeting ID。'
    )
  }
  const listOnly = ctx.flags.get('list') === true
  const selection = getOptionalStringFlag(ctx.flags, 'recording')
  const output = getOptionalStringFlag(ctx.flags, 'output')
  if (listOnly ? Boolean(selection) : !selection || !output) {
    throw new RuntimeClientError(
      'invalid_argument',
      '先用 --list 查看录制，或显式指定 --recording all|序号|名称 与 --output 绝对文件路径。'
    )
  }
  const worktree = await getBrowserWorktreeSelector(ctx.flags, ctx.cwd, ctx.client)
  if (!worktree) {
    throw new RuntimeClientError('invalid_argument', '请用 --worktree 指定当前项目的原生工作树。')
  }
  const outputTarget = output ? await meetingOutputTarget(ctx, worktree, output) : null
  const url = `https://w3.huawei.com/emeeting/#/aiSummary/${meetingId}/4`
  const existingPage = getOptionalStringFlag(ctx.flags, 'page')
  const page =
    existingPage ??
    (
      await ctx.client.call<{ browserPageId: string }>(
        'browser.tabCreate',
        { worktree, url },
        { timeoutMs: 60_000 }
      )
    ).result.browserPageId
  let success = false
  const readPage = async (action: string, args: Record<string, unknown> = {}) => {
    const response = await ctx.client.call<BrowserEvalResult>(
      'browser.eval',
      {
        worktree,
        page,
        expression: meetingPageExpression(meetingId, action, args)
      },
      { timeoutMs: 20_000 }
    )
    const value = PageReply.parse(JSON.parse(response.result.result))
    if (value.error) {
      throw new RuntimeClientError(value.error, value.message ?? value.error, {
        browserPageId: page,
        url
      })
    }
    return value
  }
  const poll = async (
    action: string,
    predicate: (value: z.infer<typeof PageReply>) => boolean,
    onValue?: (value: z.infer<typeof PageReply>) => void,
    attempts = 40
  ) => {
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const value = await readPage(action)
        onValue?.(value)
        if (predicate(value)) {
          return value
        }
      } catch (reason) {
        lastError = reason
        if (reason instanceof RuntimeClientError && reason.code !== 'meeting-login-required') {
          throw reason
        }
      }
      await delay()
    }
    if (lastError) {
      throw lastError
    }
    throw new RuntimeClientError(
      'meeting-page-unavailable',
      '会议页未就绪或页面结构已变化（未出现可识别的会议正文）。请在保留的原生页检查登录和会议状态。',
      { browserPageId: page, url }
    )
  }
  try {
    // An explicitly supplied page is validated by the existing worktree/page resolver.
    await ctx.client.call<BrowserTabShowResult>('browser.tabShow', { worktree, page })
    // Why: a freshly created tab cold-loads the meeting page; the generic 20s window
    // was suspected too short here (round-9 feedback, meeting 5DAB2173…), so the first
    // ready poll gets ~30s while later stages keep the normal window.
    await poll('ready', (value) => value.ready === true, undefined, 60)
    const open = await readPage('inventory-open')
    const hasSelector = open.selector === true
    const inventory = hasSelector
      ? Inventory.parse(
          await poll(
            'inventory',
            (value) =>
              Inventory.safeParse(value).success && Inventory.parse(value).recordings.length > 0
          )
        ).recordings
      : [{ index: 1, name: '当前录制', label: '当前录制' }]
    const base = {
      schemaVersion: 1,
      provider: 'emeeting',
      meetingId,
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      worktree,
      inventoryMethod: hasSelector ? 'recording-selector' : 'single-recording-view',
      recordings: inventory
    }
    if (listOnly) {
      if (outputTarget) {
        await writeMeetingOutput(ctx, outputTarget, base)
      }
      console.log(JSON.stringify({ ...base, output: output ?? null }, null, 2))
      success = true
      return
    }
    const selected = selectMeetingRecordings(inventory, selection!)
    const transcripts: (MeetingRecording &
      ReturnType<typeof verifyTranscriptChunks> & { sourceRef: string })[] = []
    for (const recording of selected) {
      if (hasSelector) {
        if (transcripts.length > 0) {
          await readPage('inventory-open')
          await poll(
            'inventory',
            (value) =>
              Inventory.safeParse(value).success && Inventory.parse(value).recordings.length > 0
          )
        }
        await readPage('pick', { label: recording.label })
        await poll(
          'ready',
          (value) => typeof value.title === 'string' && titleMatches(value.title, recording.name)
        )
        await delay(2_500)
      }
      // Attribution (round-9, 项 E): a missing transcript tab on an already rendered
      // page means this recording has no voice transcript — report that instead of
      // folding it into the generic not-ready/structure-changed code, per the
      // meeting-transcript reference promise to return a concrete reason.
      let tabMissingOnRenderedPage = false
      try {
        await poll(
          'transcript-tab',
          (value) => value.clicked === true,
          (value) => {
            if (value.clicked === false && value.pageRendered === true) {
              tabMissingOnRenderedPage = true
            }
          }
        )
      } catch (reason) {
        if (
          tabMissingOnRenderedPage &&
          reason instanceof RuntimeClientError &&
          reason.code === 'meeting-page-unavailable'
        ) {
          throw new RuntimeClientError(
            'meeting-transcript-unavailable',
            '该录制未生成语音转写：页面已渲染但「语音转文字」标签在等待窗口内未出现。',
            { browserPageId: page, url }
          )
        }
        throw reason
      }
      await delay(2_500)
      const captured = Meta.parse(await readPage('capture'))
      const chunks: string[] = []
      for (let offset = 0; offset < captured.length; offset += 24_000) {
        const chunk = await readPage('chunk', { offset, size: 24_000 })
        if (
          chunk.title !== captured.title ||
          chunk.length !== captured.length ||
          chunk.fingerprint !== captured.fingerprint
        ) {
          throw new RuntimeClientError(
            'meeting-transcript-changed',
            '读取期间录制或转写内容变化，未保存，请重试。'
          )
        }
        chunks.push(z.string().parse(chunk.text))
      }
      const verified = verifyTranscriptChunks(chunks, captured)
      transcripts.push({ ...recording, sourceRef: `${url} · ${recording.name}`, ...verified })
    }
    const topics = await readPage('topics')
    const result = {
      ...base,
      selection,
      selectedCount: selected.length,
      readCount: transcripts.length,
      allRecordingsRead: selected.length === inventory.length,
      complete: true,
      characters: transcripts.reduce((count, item) => count + item.characters, 0),
      topics,
      transcripts
    }
    await writeMeetingOutput(ctx, outputTarget!, result)
    console.log(
      JSON.stringify(
        {
          ...result,
          transcripts: transcripts.map(({ text: _text, ...metadata }) => metadata),
          output
        },
        null,
        2
      )
    )
    success = true
  } catch (error) {
    throw new RuntimeClientError(
      error instanceof RuntimeClientError ? error.code : 'meeting-transcript-failed',
      error instanceof Error ? error.message : String(error),
      {
        ...(error instanceof RuntimeClientError ? { cause: error.data } : {}),
        browserPageId: page,
        url
      }
    )
  } finally {
    if (success && !existingPage) {
      await ctx.client.call('browser.tabClose', { worktree, page }).catch(() => {})
    }
  }
}

export const WORKBENCH_MEETING_HANDLERS: Record<string, CommandHandler> = {
  'bw meeting transcript': collectMeeting
}
