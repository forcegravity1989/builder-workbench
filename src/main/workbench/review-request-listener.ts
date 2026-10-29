/**
 * BW pr-review-notify 方案二接收侧：loopback HTTP 监听评审请求事件。
 * 照 RelayAgentHookServer 的坐标模式（127.0.0.1＋token＋端点文件）但不侵入
 * agent-hook 协议——body 是评审负载（parseReviewRequestBody 拒判畸形），
 * 收到即经 notifications:dispatch 弹原生通知。跨机/跨用户可达性由发送方
 * peers 配置决定（token 即凭据，共享口径 spec 待决 2），本监听只绑 loopback。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  NotificationDispatchRequest,
  NotificationDispatchResult
} from '../../shared/notification-settings-types'
import {
  parseReviewRequestBody,
  type ReviewRequestPayload
} from '../../shared/workbench/review-request-payload'

const REVIEW_REQUEST_BODY_LIMIT_BYTES = 64 * 1024
const REVIEW_REQUEST_TOKEN_HEADER = 'x-bw-review-token'

export type ReviewRequestListenerHandle = {
  port: number
  token: string
  endpointFilePath: string
  stop: () => void
}

function reviewEndpointFilePath(endpointDir: string): string {
  // Why: 与 agent-hook 端点同目录不同名——同机同用户可互读坐标；文件内容是
  // BW 自己的键名，不会被 agent-hook 客户端误 source。
  return join(
    endpointDir,
    process.platform === 'win32' ? 'bw-review-request.cmd' : 'bw-review-request.env'
  )
}

/** 原子写端点文件（照 agent-hook writeEndpointFile 的 tmp+rename 模式）。 */
function writeReviewEndpointFile(
  endpointDir: string,
  finalPath: string,
  port: number,
  token: string
): boolean {
  const tmpPath = join(endpointDir, `.bw-review-${process.pid}-${randomUUID()}.tmp`)
  const prefix = process.platform === 'win32' ? 'set ' : ''
  const lines = [
    `${prefix}BW_REVIEW_REQUEST_PORT=${port}`,
    `${prefix}BW_REVIEW_REQUEST_TOKEN=${token}`,
    ''
  ]
  try {
    mkdirSync(endpointDir, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') {
      try {
        chmodSync(endpointDir, 0o700)
      } catch {
        // best-effort
      }
    }
    writeFileSync(tmpPath, lines.join(process.platform === 'win32' ? '\r\n' : '\n'), {
      mode: 0o600
    })
    renameSync(tmpPath, finalPath)
    return true
  } catch (err) {
    process.stderr.write(
      `[bw-review-request] failed to write endpoint file: ${err instanceof Error ? err.message : String(err)}\n`
    )
    try {
      unlinkSync(tmpPath)
    } catch {
      // tmp may already be gone
    }
    return false
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > REVIEW_REQUEST_BODY_LIMIT_BYTES) {
      throw new Error('body too large')
    }
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) {
    return null
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function startReviewRequestListener(
  dispatch: (
    request: NotificationDispatchRequest
  ) => NotificationDispatchResult | Promise<NotificationDispatchResult>
): ReviewRequestListenerHandle | null {
  const endpointDir = join(homedir(), '.orca-relay', 'agent-hooks')
  const endpointFilePath = reviewEndpointFilePath(endpointDir)
  const token = randomUUID()
  const server = createServer((req, res) => {
    void handleReviewRequest(req, res, token, dispatch)
  })
  let port = 0
  try {
    server.listen(0, '127.0.0.1')
  } catch (err) {
    process.stderr.write(
      `[bw-review-request] listener failed to start: ${err instanceof Error ? err.message : String(err)}\n`
    )
    return null
  }
  server.on('listening', () => {
    const address = server.address()
    if (address && typeof address === 'object' && typeof address.port === 'number') {
      port = address.port
      writeReviewEndpointFile(endpointDir, endpointFilePath, port, token)
    }
  })
  server.on('error', (err) => {
    process.stderr.write(`[bw-review-request] server error: ${err.message}\n`)
  })
  return {
    get port() {
      return port
    },
    get token() {
      return token
    },
    endpointFilePath,
    stop: () => {
      server.close()
      try {
        unlinkSync(endpointFilePath)
      } catch {
        // file may already be gone
      }
    }
  }
}

async function handleReviewRequest(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  dispatch: (
    request: NotificationDispatchRequest
  ) => NotificationDispatchResult | Promise<NotificationDispatchResult>
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(404)
    res.end()
    return
  }
  if (req.headers[REVIEW_REQUEST_TOKEN_HEADER] !== token) {
    res.writeHead(403)
    res.end()
    return
  }
  try {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname !== '/review-request') {
      res.writeHead(404)
      res.end()
      return
    }
    const body = await readJsonBody(req)
    const payload = parseReviewRequestBody(body)
    if (!payload) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'invalid review request payload' }))
      return
    }
    let result: NotificationDispatchResult
    try {
      result = await dispatch(toDispatchRequest(payload))
    } catch (err) {
      // Why 5xx: dispatch 崩是服务端故障，报 400 会让发送方误判负载畸形。
      process.stderr.write(
        `[bw-review-request] dispatch failed: ${err instanceof Error ? err.message : String(err)}\n`
      )
      res.writeHead(500)
      res.end(JSON.stringify({ error: 'dispatch failed' }))
      return
    }
    res.writeHead(result.delivered ? 200 : 503)
    res.end(JSON.stringify(result))
  } catch (err) {
    // URL/body/JSON 解析失败都归客户端请求问题。
    process.stderr.write(
      `[bw-review-request] request failed: ${err instanceof Error ? err.message : String(err)}\n`
    )
    res.writeHead(400)
    res.end(JSON.stringify({ error: 'bad request' }))
  }
}

/** 同 PR 重复投递替换旧通知（notificationId 去重），标题/正文由 notification-options 定。 */
function toDispatchRequest(payload: ReviewRequestPayload): NotificationDispatchRequest {
  return {
    source: 'review-request',
    notificationId: `bw-review-request:${payload.repo}#${payload.prNumber}`,
    reviewRequest: payload
  }
}

/** 发送侧读取本机 peers 配置（手填的接收方坐标；不入 git，token 即凭据）。 */
export type ReviewPeer = {
  name: string
  host: string
  port: number
  token: string
}

export function readReviewPeers(userDataDir: string): ReviewPeer[] {
  try {
    const raw = readFileSync(join(userDataDir, 'review-peers.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as { peers?: unknown }).peers)
    ) {
      return []
    }
    const peers: ReviewPeer[] = []
    for (const entry of (parsed as { peers: unknown[] }).peers) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const { name, host, port, token } = entry as Record<string, unknown>
      if (
        typeof name === 'string' &&
        name.trim().length > 0 &&
        typeof host === 'string' &&
        host.trim().length > 0 &&
        typeof port === 'number' &&
        Number.isInteger(port) &&
        port > 0 &&
        port < 65536 &&
        typeof token === 'string' &&
        token.length > 0
      ) {
        peers.push({ name, host, port, token })
      }
    }
    return peers
  } catch {
    return []
  }
}
