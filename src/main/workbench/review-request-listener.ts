/**
 * pr-review-notify 接收侧：监听评审请求并经 IPC 交给渲染层通知。
 * 照 RelayAgentHookServer 的坐标模式（token＋端点文件），但不侵入 agent-hook
 * 协议；默认只绑 loopback，跨主机时由 BW_REVIEW_LISTEN_HOST 显式指定监听地址，
 * 端口仍随机、token 持久化，避免重启后已配置的对端全部失效。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  parseReviewRequestBody,
  type ReviewRequestPayload
} from '../../shared/workbench/pr-review-request'

const REVIEW_REQUEST_BODY_LIMIT_BYTES = 64 * 1024
const REVIEW_REQUEST_TOKEN_HEADER = 'x-bw-review-token'
const DEFAULT_LISTEN_HOST = '127.0.0.1'

export type ReviewRequestListenerHandle = {
  host: string
  port: number
  token: string
  endpointFilePath: string
  stop: () => void
}

export type ReviewPeer = {
  name: string
  host: string
  port: number
  token: string
}

function reviewEndpointFilePath(endpointDir: string): string {
  // Why: 与 agent-hook 端点同目录不同名——同机同用户可互读坐标；文件内容是
  // BW 自己的键名，不会被 agent-hook 客户端误 source。
  return join(
    endpointDir,
    process.platform === 'win32' ? 'bw-review-request.cmd' : 'bw-review-request.env'
  )
}

function writeReviewEndpointFile(
  endpointDir: string,
  finalPath: string,
  host: string,
  port: number,
  token: string
): boolean {
  const tmpPath = join(endpointDir, `.bw-review-${process.pid}-${randomUUID()}.tmp`)
  const prefix = process.platform === 'win32' ? 'set ' : ''
  const lines = [
    `${prefix}BW_REVIEW_REQUEST_HOST=${host}`,
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

/** token 持久化到 userData，重启后已配置的对端无需重新交换坐标。 */
export function readOrCreateReviewToken(userDataDir: string): string {
  const tokenPath = join(userDataDir, 'review-request-token')
  try {
    const existing = readFileSync(tokenPath, 'utf8').trim()
    if (existing.length > 0) {
      return existing
    }
  } catch {
    // first launch
  }
  const token = randomUUID()
  try {
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(tokenPath, token, { mode: 0o600 })
  } catch (err) {
    process.stderr.write(
      `[bw-review-request] failed to persist token: ${err instanceof Error ? err.message : String(err)}\n`
    )
  }
  return token
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

export function startReviewRequestListener({
  userDataDir,
  onRequest
}: {
  userDataDir: string
  onRequest: (payload: ReviewRequestPayload) => void
}): ReviewRequestListenerHandle {
  const endpointDir = join(homedir(), '.orca-relay', 'agent-hooks')
  const endpointFilePath = reviewEndpointFilePath(endpointDir)
  const host = process.env.BW_REVIEW_LISTEN_HOST?.trim() || DEFAULT_LISTEN_HOST
  const token = readOrCreateReviewToken(userDataDir)
  const server = createServer((req, res) => {
    void handleReviewRequest(req, res, token, onRequest)
  })
  let port = 0
  server.listen(0, host)
  server.on('listening', () => {
    const address = server.address()
    if (address && typeof address === 'object' && typeof address.port === 'number') {
      port = address.port
      writeReviewEndpointFile(endpointDir, endpointFilePath, host, port, token)
    }
  })
  server.on('error', (err) => {
    process.stderr.write(`[bw-review-request] server error: ${err.message}\n`)
  })
  return {
    host,
    get port() {
      return port
    },
    token,
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
  onRequest: (payload: ReviewRequestPayload) => void
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
    const payload = parseReviewRequestBody(await readJsonBody(req))
    if (!payload) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'invalid review request payload' }))
      return
    }
    onRequest(payload)
    res.writeHead(200)
    res.end(JSON.stringify({ ok: true }))
  } catch (err) {
    process.stderr.write(
      `[bw-review-request] request failed: ${err instanceof Error ? err.message : String(err)}\n`
    )
    res.writeHead(400)
    res.end(JSON.stringify({ error: 'bad request' }))
  }
}

/** 发送侧读取本机 peers 配置（接收方坐标；不入 git，token 即凭据）。 */
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
