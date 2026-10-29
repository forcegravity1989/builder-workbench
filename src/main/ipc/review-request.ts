/**
 * BW pr-review-notify 方案二 IPC：本机监听端点坐标读回（配 peers 用）＋
 * 发送侧把评审负载 POST 到配置的接收方 peers。peers 坐标存 userData 下的
 * review-peers.json（手填、不入 git；token 即凭据，跨用户共享口径 spec 待决 2）。
 */
import { request as httpRequest } from 'node:http'
import { userInfo } from 'node:os'

import { app, ipcMain } from 'electron'

import type {
  NotificationDispatchRequest,
  NotificationDispatchResult
} from '../../shared/notification-settings-types'
import type {
  ReviewRequestEndpointResult,
  ReviewRequestPeerResult,
  ReviewRequestPayload,
  ReviewRequestSendResult
} from '../../shared/workbench/review-request-payload'
import {
  readReviewPeers,
  startReviewRequestListener,
  type ReviewPeer,
  type ReviewRequestListenerHandle
} from '../workbench/review-request-listener'

const REVIEW_REQUEST_SEND_TIMEOUT_MS = 5000

let listener: ReviewRequestListenerHandle | null = null

export function registerReviewRequestHandlers({
  dispatchNotification
}: {
  dispatchNotification: (
    request: NotificationDispatchRequest
  ) => NotificationDispatchResult | Promise<NotificationDispatchResult>
}): void {
  if (!listener) {
    listener = startReviewRequestListener(dispatchNotification)
  }

  ipcMain.removeHandler('bw-review:endpoint')
  ipcMain.handle('bw-review:endpoint', (): ReviewRequestEndpointResult => ({
    listening: listener !== null && listener.port > 0,
    port: listener?.port ?? 0,
    token: listener?.token ?? '',
    endpointFilePath: listener?.endpointFilePath ?? ''
  }))

  ipcMain.removeHandler('bw-review:sendReviewRequest')
  ipcMain.handle(
    'bw-review:sendReviewRequest',
    async (
      _event,
      args: { payload: Omit<ReviewRequestPayload, 'sender'> }
    ): Promise<ReviewRequestSendResult> => {
      const peers = readReviewPeers(app.getPath('userData'))
      if (peers.length === 0) {
        return {
          results: [
            {
              name: '',
              host: '',
              port: 0,
              ok: false,
              status: null,
              error: '未配置接收方（review-peers.json 无有效条目）'
            }
          ]
        }
      }
      // Why: 发送方展示名用本机用户名——方案二不经 WeLink，无账号体系可查；
      // 通知正文只作人读标识，不做鉴权依据（token 才是凭据）。
      const payload: ReviewRequestPayload = { ...args.payload, sender: userInfo().username }
      const results = await Promise.all(peers.map((peer) => postReviewToPeer(peer, payload)))
      return { results }
    }
  )
}

/** POST 单个 peer；评审请求是显式用户动作，失败/超时如实回报不重试。 */
async function postReviewToPeer(
  peer: ReviewPeer,
  payload: ReviewRequestPayload
): Promise<ReviewRequestPeerResult> {
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
            error: null
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
