/**
 * pr-review-notify 主进程 IPC：监听评审请求并转交渲染层，发送时按本机
 * review-peers.json 逐个同伴投递。评审请求是显式用户动作，逐目标回报结果，
 * 不重试、不冒充成功（spec 发送／持久化与失败）。
 */
import { request as httpRequest } from 'node:http'
import { userInfo } from 'node:os'

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'

import {
  parseReviewRequestBody,
  type ReviewIncomingRequest,
  type ReviewPeerDelivery,
  type ReviewRequestPayload,
  type ReviewSendResult
} from '../../shared/workbench/pr-review-request'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { isWorkbenchProduct } from '../startup/workbench-product'
import { getTrustedUIRendererWebContents } from './ui'
import {
  readReviewPeers,
  startReviewRequestListener,
  type ReviewPeer,
  type ReviewRequestListenerHandle
} from '../workbench/review-request-listener'

const REVIEW_REQUEST_SEND_TIMEOUT_MS = 5000

let listener: ReviewRequestListenerHandle | null = null
/** 渲染层还没挂载时收到的请求先排队，挂载后经 bw-review:pending 取走。 */
const pendingIncoming = new Map<string, ReviewIncomingRequest>()
/** 渲染层首次取走后，后续请求只走广播，避免重挂载时重复补拉。 */
let pendingDrained = false

function incomingKey(payload: ReviewRequestPayload): string {
  const host = payload.repo.host ?? 'github.com'
  return `${host}/${payload.repo.owner}/${payload.repo.name}#${payload.prNumber}`
}

function broadcastIncoming(payload: ReviewIncomingRequest): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('bw-review:received', payload)
    }
  }
}

export function registerReviewNotificationHandlers(): void {
  // Why: 这是 BW 叠层能力；普通 Orca 构建不写端点文件、不开监听端口。
  if (!isWorkbenchProduct()) {
    return
  }
  if (!listener) {
    listener = startReviewRequestListener({
      userDataDir: getCanonicalUserDataPath(),
      onRequest: (payload) => {
        const incoming: ReviewIncomingRequest = {
          ...payload,
          receivedAt: new Date().toISOString()
        }
        if (!pendingDrained) {
          pendingIncoming.set(incomingKey(payload), incoming)
        }
        broadcastIncoming(incoming)
      }
    })
  }

  // Why: 评审通道只服务当前应用窗口；与 milestone-recovery 同口径，拒绝子帧/其他
  // webContents 读取端点 token 或代发请求。
  const authorize = (event: IpcMainInvokeEvent): void => {
    if (
      event.sender !== getTrustedUIRendererWebContents() ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('评审通知只允许当前应用窗口访问')
    }
  }

  ipcMain.removeHandler('bw-review:pending')
  ipcMain.handle('bw-review:pending', (event): ReviewIncomingRequest[] => {
    authorize(event)
    const items = [...pendingIncoming.values()].sort((a, b) =>
      a.receivedAt.localeCompare(b.receivedAt)
    )
    pendingIncoming.clear()
    pendingDrained = true
    return items
  })

  ipcMain.removeHandler('bw-review:send')
  ipcMain.handle('bw-review:send', async (event, input: unknown): Promise<ReviewSendResult> => {
    authorize(event)
    const sentAt = new Date().toISOString()
    const peers = readReviewPeers(getCanonicalUserDataPath())
    if (peers.length === 0) {
      return { sentAt, results: [] }
    }
    const payload = parseReviewRequestBody({
      ...(input as Record<string, unknown>),
      // Why: 发送人展示名只作人读标识；token 才是凭据，不让渲染层自报。
      sender: userInfo().username,
      sentAt
    })
    if (!payload) {
      return {
        sentAt,
        results: [
          {
            name: '',
            host: '',
            port: 0,
            ok: false,
            status: null,
            error: '评审请求内容无效'
          }
        ]
      }
    }
    const results = await Promise.all(peers.map((peer) => postReviewToPeer(peer, payload)))
    return { sentAt, results }
  })
}

/** POST 单个 peer；超时/断连如实回报，不重试。 */
async function postReviewToPeer(
  peer: ReviewPeer,
  payload: ReviewRequestPayload
): Promise<ReviewPeerDelivery> {
  const body = JSON.stringify(payload)
  const base = { name: peer.name, host: peer.host, port: peer.port }
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        host: peer.host,
        port: peer.port,
        path: '/review-request',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-bw-review-token': peer.token
        },
        timeout: REVIEW_REQUEST_SEND_TIMEOUT_MS
      },
      (res) => {
        const status = res.statusCode ?? null
        res.resume()
        res.on('end', () => {
          resolve({
            ...base,
            ok: status !== null && status >= 200 && status < 300,
            status,
            error: status !== null && status >= 200 && status < 300 ? undefined : `HTTP ${status}`
          })
        })
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
    req.on('error', (err) => {
      resolve({ ...base, ok: false, status: null, error: err.message })
    })
    req.end(body)
  })
}
