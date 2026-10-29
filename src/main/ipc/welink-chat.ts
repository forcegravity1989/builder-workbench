/**
 * WeLink 项目群 IPC（pr-review-notify 方案一）：welink-cli IM 收发的 main 侧执行。
 * 登录态判定复用 connectors 的 isWelinkAuthenticated（EXPIRED 判未登录，不装绿）；
 * IM 命令走网络，超时独立于 preflight 探测的 5s。
 */
import { ipcMain } from 'electron'
import { isWelinkAuthenticated } from '../preflight/bw-cli-auth-status'
import { execLocalPreflightCommandOrThrow } from './preflight-command-exec'
import type {
  WelinkChatHistoryRequest,
  WelinkChatHistoryResult,
  WelinkChatMessage,
  WelinkChatSendRequest,
  WelinkChatSendResult
} from '../../shared/welink-chat-types'

const WELINK_IM_TIMEOUT_MS = 15000
const HISTORY_PAGE_MAX = 100

/** CLI 输出直接是 JSON；保守截取首尾大括号，防上游版本在前后加提示行。 */
function parseWelinkJson(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('welink-cli 输出不是 JSON')
  }
  const parsed: unknown = JSON.parse(stdout.slice(start, end + 1))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('welink-cli 输出不是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

function readChatInfo(payload: Record<string, unknown>): Record<string, unknown>[] {
  const respData = payload.respData
  if (typeof respData !== 'object' || respData === null || Array.isArray(respData)) {
    return []
  }
  const chatInfo = (respData as Record<string, unknown>).chatInfo
  if (!Array.isArray(chatInfo)) {
    return []
  }
  return chatInfo.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
  )
}

function toWelinkChatMessage(raw: Record<string, unknown>): WelinkChatMessage | null {
  const msgId = raw.msgId
  const sender = raw.sender
  const contentType = raw.contentType
  const content = raw.content
  const serverSendTime = raw.serverSendTime
  if (
    typeof msgId !== 'number' ||
    typeof sender !== 'string' ||
    typeof contentType !== 'string' ||
    typeof content !== 'string' ||
    typeof serverSendTime !== 'number'
  ) {
    return null
  }
  return { msgId, sender, contentType, content, serverSendTime }
}

async function queryHistory(request: WelinkChatHistoryRequest): Promise<WelinkChatHistoryResult> {
  const groupId = request.groupId.trim()
  if (!groupId) {
    return { messages: [], maxMsgId: null, error: '群号不能为空' }
  }
  const count = Math.min(Math.max(request.count ?? 30, 1), HISTORY_PAGE_MAX)
  const args = [
    'im',
    'query-history-message',
    '--group-id',
    groupId,
    '--query-count',
    String(count)
  ]
  if (typeof request.cursor === 'number' && request.cursor > 0) {
    args.push('--message-id', String(request.cursor))
    args.push('--query-direction', request.direction === 1 ? '1' : '0')
  }
  try {
    const { stdout } = await execLocalPreflightCommandOrThrow(
      'welink-cli',
      args,
      WELINK_IM_TIMEOUT_MS
    )
    const payload = parseWelinkJson(stdout)
    const messages = readChatInfo(payload)
      .map(toWelinkChatMessage)
      .filter((item): item is WelinkChatMessage => item !== null)
      .sort((a, b) => a.serverSendTime - b.serverSendTime)
    const maxMsgId =
      typeof (payload.respData as Record<string, unknown> | undefined)?.maxMsgId === 'number'
        ? ((payload.respData as Record<string, unknown>).maxMsgId as number)
        : (messages.at(-1)?.msgId ?? null)
    return { messages, maxMsgId, error: null }
  } catch (error) {
    return {
      messages: [],
      maxMsgId: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Why: Windows 下 welink-cli 经 .cmd shim 走 `cmd.exe /c` 传参，`"` 与 `%` 由 cmd
 * 按自身规则解析（Node 的 MSVCRT `\"` 转义 cmd 不认、`%VAR%` 会展开），PR 标题等
 * 外部可影响文本可越出参数边界——统一替换为全角等价字符：消息语义保留、注入面封死。
 */
function sanitizeCliText(text: string): string {
  return text.replaceAll('"', '＂').replaceAll('%', '％')
}

async function sendMessage(request: WelinkChatSendRequest): Promise<WelinkChatSendResult> {
  const groupId = request.groupId.trim()
  const text = request.text
  if (!groupId) {
    return { ok: false, error: '群号不能为空' }
  }
  if (!text.trim()) {
    return { ok: false, error: '消息内容不能为空' }
  }
  try {
    const { stdout } = await execLocalPreflightCommandOrThrow(
      'welink-cli',
      ['im', 'send-to-group', '--group-id', groupId, '--text', sanitizeCliText(text)],
      WELINK_IM_TIMEOUT_MS
    )
    // 发送回执与查询同为 resultCode JSON；"0" 即送达。解析不出结果码时如实报错，不装成功。
    const payload = parseWelinkJson(stdout)
    if (payload.resultCode !== '0') {
      return {
        ok: false,
        error: `welink-cli 返回结果码 ${String(payload.resultCode)}：${String(
          payload.resultContext ?? ''
        )}`.trim()
      }
    }
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function registerWelinkChatHandlers(): void {
  ipcMain.removeHandler('welink-chat:authStatus')
  ipcMain.handle('welink-chat:authStatus', () => isWelinkAuthenticated())

  ipcMain.removeHandler('welink-chat:history')
  ipcMain.handle('welink-chat:history', (_event, args: WelinkChatHistoryRequest) =>
    queryHistory(args)
  )

  ipcMain.removeHandler('welink-chat:send')
  ipcMain.handle('welink-chat:send', (_event, args: WelinkChatSendRequest) => sendMessage(args))
}
