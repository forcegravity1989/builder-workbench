import { createHash } from 'node:crypto'
import { request as httpsRequest } from 'node:https'
import { RuntimeClientError } from '../runtime/types'
import { extractDocxText } from './docx'

export const W3_ORIGIN = 'https://w3.huawei.com'
export const MEETING_DETAIL_PATH = 'emeeting/server/api/weteam/meeting/v1'
export const TRANSCRIPT_EXPORT_PATH = 'emeeting/server/api/weteam/meeting/export/recordSummary'
const DAY_MS = 24 * 60 * 60 * 1000
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024

export type MeetingDetail = {
  subject: string
  startTime: number
  endTime: number
  topics: { name: string; category: string; reporter: string }[]
}

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function meetingDetailUrl(meetingId: string): string {
  return `${W3_ORIGIN}/${MEETING_DETAIL_PATH}/${meetingId}/detail`
}

/** Page the login window opens; eMeeting redirects it to SSO when the profile has no session. */
export function meetingSummaryUrl(meetingId: string): string {
  return `${W3_ORIGIN}/emeeting/#/aiSummary/${meetingId}/4`
}

export function isMeetingLoginRequired(error: unknown): boolean {
  return error instanceof RuntimeClientError && error.code === 'meeting-login-required'
}

export function transcriptExportUrl(): string {
  return `${W3_ORIGIN}/${TRANSCRIPT_EXPORT_PATH}`
}

/** eMeeting timestamps are UTC+8 wall-clock values; export filters one whole local day. */
export function utc8DayRange(startTime: number): { startTime: number; endTime: number } {
  const local = new Date(startTime + UTC8_OFFSET_MS)
  const start =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - UTC8_OFFSET_MS
  return { startTime: start, endTime: start + DAY_MS - 1000 }
}

export function transcriptExportPayload(
  meetingId: string,
  detail: Pick<MeetingDetail, 'subject' | 'startTime'>
): JsonObject {
  const local = new Date(detail.startTime + UTC8_OFFSET_MS)
  const date = [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, '0'),
    String(local.getUTCDate()).padStart(2, '0')
  ].join('')
  const range = utc8DayRange(detail.startTime)
  return {
    languageType: 'Original',
    meetingNum: meetingId,
    startTime: range.startTime,
    endTime: range.endTime,
    subject: `${date}-${detail.subject}-语音转文字`,
    type: 'speakText'
  }
}

async function requestBuffer(
  url: string,
  options: { method: 'GET' | 'POST'; cookie: string; body?: unknown }
): Promise<{ status: number; contentType: string; location: string; body: Buffer }> {
  return await new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
    const request = httpsRequest(
      url,
      {
        method: options.method,
        headers: {
          Cookie: options.cookie,
          Accept: 'application/json, application/octet-stream',
          // Node does not transparently unzip responses; ask for the DOCX bytes as-is.
          'Accept-Encoding': 'identity',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {})
        },
        // Why: eMeeting sits behind the corporate PKI, which the Node trust store
        // does not carry; the same boundary is used by existing internal tooling.
        rejectUnauthorized: false,
        timeout: 60_000
      },
      (response) => {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error('会议接口返回内容过大'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            contentType: String(response.headers['content-type'] ?? ''),
            location: String(response.headers.location ?? ''),
            body: Buffer.concat(chunks)
          })
        )
      }
    )
    request.on('timeout', () => request.destroy(new Error('会议接口请求超时')))
    request.on('error', reject)
    if (payload) {
      request.write(payload)
    }
    request.end()
  })
}

function loginRedirect(status: number, location: string): RuntimeClientError | undefined {
  return status >= 300 && status < 400 && /login\.huawei\.com|\/login/i.test(location)
    ? new RuntimeClientError(
        'meeting-login-required',
        '会议接口要求重新登录，请重新运行命令并在打开的 Chrome 登录窗口完成 eMeeting 登录后重试。'
      )
    : undefined
}

function apiError(body: Buffer, fallback: string): RuntimeClientError {
  const text = body.toString('utf8').trim()
  try {
    const parsed = asObject(JSON.parse(text))
    if (asNumber(parsed?.code) === 401) {
      return new RuntimeClientError(
        'meeting-login-required',
        '会议接口登录态已失效，请重新运行命令并在打开的 Chrome 登录窗口完成 eMeeting 登录后重试。'
      )
    }
    const message = asString(parsed?.message) || asString(parsed?.msg)
    if (message) {
      return new RuntimeClientError('meeting-api-failed', `会议接口返回错误：${message}`)
    }
  } catch {
    // Non-JSON bodies are reported by the caller with context.
  }
  return new RuntimeClientError('meeting-api-failed', fallback)
}

export async function fetchMeetingDetail(
  cookie: string,
  meetingId: string
): Promise<MeetingDetail> {
  const url = meetingDetailUrl(meetingId)
  const response = await requestBuffer(url, { method: 'GET', cookie })
  if (response.status === 401) {
    throw apiError(Buffer.from('{"code":401}'), '会议详情接口未授权')
  }
  const redirect = loginRedirect(response.status, response.location)
  if (redirect) {
    throw redirect
  }
  let payload: JsonObject
  try {
    payload = asObject(JSON.parse(response.body.toString('utf8'))) ?? {}
  } catch {
    throw new RuntimeClientError(
      'meeting-api-failed',
      `会议详情接口未返回 JSON（HTTP ${response.status}）。`
    )
  }
  if (asNumber(payload.code) === 401) {
    throw apiError(Buffer.from('{"code":401}'), '会议详情接口未授权')
  }
  const detail = asObject(payload.response) ?? asObject(payload.data) ?? payload
  const meetingTime = asObject(detail.meetingTime) ?? {}
  const subject = asString(detail.subject)
  const startTime = asNumber(meetingTime.meetingStartTime) || asNumber(detail.meetingStartTime)
  if (asNumber(payload.code) !== 200 || !subject || !startTime) {
    throw new RuntimeClientError(
      'meeting-detail-unavailable',
      `无法读取会议详情（HTTP ${response.status}，code ${String(payload.code ?? '未知')}）。`
    )
  }
  const topics = Array.isArray(detail.meetingTopicList) ? detail.meetingTopicList : []
  return {
    subject,
    startTime,
    endTime: asNumber(meetingTime.meetingEndTime),
    topics: topics.flatMap((item) => {
      const topic = asObject(item)
      if (!topic) {
        return []
      }
      const members = Array.isArray(topic.topicMembers) ? topic.topicMembers : []
      const reporter = members
        .map(asObject)
        .find((member) => asString(member?.roleKey) === 'topicReporter')
      return [
        {
          name: asString(topic.name) || '未命名',
          category: asString(topic.topicCategory),
          reporter: asString(asObject(reporter?.userInfoVo)?.name)
        }
      ]
    })
  }
}

export async function downloadTranscriptText(
  cookie: string,
  meetingId: string,
  detail: MeetingDetail
): Promise<{ text: string; characters: number; sha256: string }> {
  const url = transcriptExportUrl()
  const response = await requestBuffer(url, {
    method: 'POST',
    cookie,
    body: transcriptExportPayload(meetingId, detail)
  })
  if (response.status === 401) {
    throw apiError(Buffer.from('{"code":401}'), '转写导出接口未授权')
  }
  const redirect = loginRedirect(response.status, response.location)
  if (redirect) {
    throw redirect
  }
  if (response.body.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    let text: string
    try {
      text = extractDocxText(response.body)
    } catch (error) {
      throw new RuntimeClientError(
        'meeting-transcript-incomplete',
        `转写文件无法解析：${error instanceof Error ? error.message : String(error)}`
      )
    }
    if (!text.trim()) {
      throw new RuntimeClientError('meeting-transcript-unavailable', '转写文件为空，未保存。')
    }
    return {
      text,
      characters: text.length,
      sha256: createHash('sha256').update(text).digest('hex')
    }
  }
  throw apiError(
    response.body,
    `转写导出接口未返回 DOCX（HTTP ${response.status}，${response.contentType || '无内容类型'}）。`
  )
}
