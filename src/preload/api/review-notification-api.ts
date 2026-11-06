/**
 * pr-review-notify preload 桥：渲染层读本机接收端点（配同伴用）、取冷启动
 * 排队的请求、发送评审请求，并订阅主进程转来的新请求。
 */
import { ipcRenderer } from 'electron'

import type {
  ReviewIncomingRequest,
  ReviewSendInput,
  ReviewSendResult
} from '../../shared/workbench/pr-review-request'

export type ReviewNotificationApi = {
  /** 取走主进程在渲染层挂载前排队收到的请求。 */
  pending(): Promise<ReviewIncomingRequest[]>
  send(input: ReviewSendInput): Promise<ReviewSendResult>
  onReceived(callback: (request: ReviewIncomingRequest) => void): () => void
}

export const reviewNotificationApi: ReviewNotificationApi = {
  pending: () => ipcRenderer.invoke('bw-review:pending'),
  send: (input) => ipcRenderer.invoke('bw-review:send', input),
  onReceived: (callback) => {
    const handler = (_event: unknown, request: ReviewIncomingRequest): void => callback(request)
    ipcRenderer.on('bw-review:received', handler)
    return () => ipcRenderer.removeListener('bw-review:received', handler)
  }
}
