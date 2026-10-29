/**
 * 方案二（pr-review-notify）评审事件负载：发送方经接收方 loopback 端点 POST 的
 * 最小契约，字段与方案一评审消息的共用底座一致（repo/prNumber/title＋sender）。
 * parseReviewRequestBody 拒判畸形负载——接收侧不猜，坏负载直接 400。
 */

export type ReviewRequestPayload = {
  /** owner/name 两段式，与评审消息「仓库：」行同格式。 */
  repo: string
  prNumber: number
  title: string
  /** 发送方展示名，进通知正文「<sender> 请求评审 …」。 */
  sender: string
}

const REPO_PATTERN = /^[^\s/]+\/[^\s]+$/
const TITLE_MAX = 500
const SENDER_MAX = 100

export function parseReviewRequestBody(raw: unknown): ReviewRequestPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const { repo, prNumber, title, sender } = raw as Record<string, unknown>
  if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) {
    return null
  }
  if (
    typeof prNumber !== 'number' ||
    !Number.isInteger(prNumber) ||
    prNumber <= 0 ||
    prNumber > 1_000_000_000
  ) {
    return null
  }
  if (typeof title !== 'string' || title.trim().length === 0 || title.length > TITLE_MAX) {
    return null
  }
  if (typeof sender !== 'string' || sender.trim().length === 0 || sender.length > SENDER_MAX) {
    return null
  }
  return { repo, prNumber, title, sender }
}

/** 本机评审监听端点坐标（bw-review:endpoint 读回；配发送方 peers 用）。 */
export type ReviewRequestEndpointResult = {
  listening: boolean
  port: number
  token: string
  endpointFilePath: string
}

/** 单个接收方 peer 的投递结果；失败/超时如实回报。 */
export type ReviewRequestPeerResult = {
  name: string
  host: string
  port: number
  ok: boolean
  status: number | null
  error: string | null
}

export type ReviewRequestSendResult = {
  results: ReviewRequestPeerResult[]
}
