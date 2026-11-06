/**
 * PR 评审请求协议（pr-review-notify）：发送方 → 已连接主机的 BW。
 * 负载只承载定位与展示所需的最小信息；发送方展示名只作人读标识，
 * token 才是凭据（见 main/workbench/review-request-listener.ts）。
 */
export type ReviewRepoIdentity = {
  owner: string
  name: string
  host?: string
}

export type ReviewRequestPayload = {
  repo: ReviewRepoIdentity
  prNumber: number
  title: string
  sourceBranch: string
  targetBranch: string
  sender: string
  round: number
  sentAt: string
}

/** 渲染层发起：发送人与发送时间由 main 在投递时补，防止渲染层自报身份。 */
export type ReviewSendInput = Omit<ReviewRequestPayload, 'sender' | 'sentAt'>

/** 接收端交给渲染层的条目：保留到达时间，冷启动补拉时仍按真实到达时间展示。 */
export type ReviewIncomingRequest = ReviewRequestPayload & { receivedAt: string }

export type ReviewPeerDelivery = {
  name: string
  host: string
  port: number
  ok: boolean
  status: number | null
  error?: string
}

export type ReviewSendResult = {
  /** 主进程实际投递时间；轮次起点以此为准，避免渲染层与主进程时钟漂移。 */
  sentAt: string
  results: ReviewPeerDelivery[]
}

const MAX_TEXT_LENGTH = 300

function nonEmptyText(value: unknown, max = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.trim()
  return text.length > 0 && text.length <= max ? text : null
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** 拒判畸形负载：返回 null 由接收端按 400 处理，不把不可信字段带进通知。 */
export function parseReviewRequestBody(value: unknown): ReviewRequestPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const repo = record.repo
  if (!repo || typeof repo !== 'object') {
    return null
  }
  const repoRecord = repo as Record<string, unknown>
  const owner = nonEmptyText(repoRecord.owner, 100)
  const name = nonEmptyText(repoRecord.name, 100)
  const host = repoRecord.host === undefined ? undefined : nonEmptyText(repoRecord.host, 200)
  const prNumber = positiveInteger(record.prNumber)
  const title = nonEmptyText(record.title, 500)
  const sourceBranch = nonEmptyText(record.sourceBranch)
  const targetBranch = nonEmptyText(record.targetBranch)
  const sender = nonEmptyText(record.sender, 100)
  const round = positiveInteger(record.round)
  const sentAt = nonEmptyText(record.sentAt, 80)
  if (
    !owner ||
    !name ||
    (repoRecord.host !== undefined && !host) ||
    prNumber === null ||
    !title ||
    !sourceBranch ||
    !targetBranch ||
    !sender ||
    round === null ||
    !sentAt
  ) {
    return null
  }
  return {
    repo: { owner, name, ...(host ? { host } : {}) },
    prNumber,
    title,
    sourceBranch,
    targetBranch,
    sender,
    round,
    sentAt
  }
}
