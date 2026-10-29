/**
 * BW pr-review-notify 方案二 preload 桥：renderer → main 的评审请求投递与
 * 本机监听端点坐标读回（配 peers 用）。
 */
import { ipcRenderer } from 'electron'

import type {
  ReviewRequestEndpointResult,
  ReviewRequestPayload,
  ReviewRequestSendResult
} from '../../shared/workbench/review-request-payload'

export type ReviewRequestApi = {
  endpoint(): Promise<ReviewRequestEndpointResult>
  /** sender 由 main 补本机用户名；renderer 只传 PR 定位三要素。 */
  sendReviewRequest(payload: Omit<ReviewRequestPayload, 'sender'>): Promise<ReviewRequestSendResult>
}

export const reviewRequestApi: ReviewRequestApi = {
  endpoint: () => ipcRenderer.invoke('bw-review:endpoint'),
  sendReviewRequest: (payload) => ipcRenderer.invoke('bw-review:sendReviewRequest', { payload })
}
