/**
 * pr-review-notify 本机通知模型：纯数据变换，持久化见 storage.ts。
 * 「待我评审」按 PR 去重、轮次取新；「我发出的评审」保留到用户删除，
 * 其状态只由 PR 回读推导，不从发送动作或本地计数推定（spec 通知与跟踪）。
 */
import type { PRComment } from '../../../../shared/github/comment-types'
import type {
  ReviewIncomingRequest,
  ReviewPeerDelivery,
  ReviewRepoIdentity,
  ReviewSendInput
} from '../../../../shared/workbench/pr-review-request'

/** 与 GitHubWorkItem.state 同口径；null 表示没读到，不推测。 */
export type ReviewPrState = 'open' | 'closed' | 'merged' | 'draft'

/** 与 ProviderCheckSummary.state 同口径；none/未读到都归 null。 */
export type ReviewCheckState = 'success' | 'failure' | 'pending' | 'neutral'

export type ReviewIncomingNote = {
  id: string
  repo: ReviewRepoIdentity
  prNumber: number
  title: string
  sourceBranch: string
  targetBranch: string
  sender: string
  round: number
  sentAt: string
  receivedAt: string
  readback: ReviewReadback | null
  readbackError: string | null
}

/** PR 动态回读；任一项为 null 表示该次没读到，不当作 0、未合入或已通过。 */
export type ReviewReadback = {
  openCommentCount: number | null
  merged: boolean | null
  prState: ReviewPrState | null
  checksState: ReviewCheckState | null
  checkedAt: string
}

export type ReviewOutgoingNote = {
  id: string
  repo: ReviewRepoIdentity
  prNumber: number
  title: string
  sourceBranch: string
  targetBranch: string
  round: number
  /** 本轮起点：只统计此后创建的未解决检视意见。 */
  roundStartedAt: string
  sentAt: string
  deliveries: ReviewPeerDelivery[]
  readback: ReviewReadback | null
  readbackError: string | null
}

export type ReviewNotificationsState = {
  incoming: ReviewIncomingNote[]
  outgoing: ReviewOutgoingNote[]
}

export const EMPTY_REVIEW_NOTIFICATIONS: ReviewNotificationsState = { incoming: [], outgoing: [] }

export function reviewNoteId(repo: ReviewRepoIdentity, prNumber: number): string {
  return `${repo.host ?? 'github.com'}/${repo.owner}/${repo.name}#${prNumber}`
}

function newerFirst<T extends { receivedAt?: string; sentAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (b.receivedAt ?? b.sentAt).localeCompare(a.receivedAt ?? a.sentAt)
  )
}

/** 同 PR 同轮重复投递不重复；新轮次覆盖旧条目并显示新轮次。 */
export function applyIncomingRequest(
  state: ReviewNotificationsState,
  request: ReviewIncomingRequest
): ReviewNotificationsState {
  const id = reviewNoteId(request.repo, request.prNumber)
  const existing = state.incoming.find((note) => note.id === id)
  if (existing && existing.round > request.round) {
    return state
  }
  const sameRound = existing?.round === request.round
  const next: ReviewIncomingNote = {
    id,
    repo: request.repo,
    prNumber: request.prNumber,
    title: request.title,
    sourceBranch: request.sourceBranch,
    targetBranch: request.targetBranch,
    sender: request.sender,
    round: request.round,
    sentAt: request.sentAt,
    receivedAt: request.receivedAt,
    // Why: 同轮重复投递沿用读数；新轮次起点变化，旧读数不能直接沿用。
    readback: sameRound ? existing.readback : null,
    readbackError: sameRound ? existing.readbackError : null
  }
  return {
    ...state,
    incoming: newerFirst([next, ...state.incoming.filter((note) => note.id !== id)])
  }
}

/**
 * 发送结果落通知：至少一个目标成功才记录；全部失败保持原状态（spec N04、
 * 再发起失败轮次不前进）。已有同 PR 通知时沿用该条，不堆叠。
 */
export function recordSentReview(
  state: ReviewNotificationsState,
  input: ReviewSendInput,
  round: number,
  sentAt: string,
  deliveries: ReviewPeerDelivery[]
): ReviewNotificationsState {
  if (!deliveries.some((delivery) => delivery.ok)) {
    return state
  }
  const id = reviewNoteId(input.repo, input.prNumber)
  const existing = state.outgoing.find((note) => note.id === id)
  if (existing && existing.round >= round) {
    return state
  }
  const next: ReviewOutgoingNote = {
    id,
    repo: input.repo,
    prNumber: input.prNumber,
    title: input.title,
    sourceBranch: input.sourceBranch,
    targetBranch: input.targetBranch,
    round,
    roundStartedAt: sentAt,
    sentAt,
    deliveries,
    // Why: 新一轮从新起点重新统计，旧读数不能直接沿用。
    readback: null,
    readbackError: null
  }
  return {
    ...state,
    outgoing: newerFirst([next, ...state.outgoing.filter((note) => note.id !== id)])
  }
}

export function deleteOutgoingNote(
  state: ReviewNotificationsState,
  id: string
): ReviewNotificationsState {
  return { ...state, outgoing: state.outgoing.filter((note) => note.id !== id) }
}

export function applyReadback(
  state: ReviewNotificationsState,
  id: string,
  readback: ReviewReadback
): ReviewNotificationsState {
  return {
    ...state,
    outgoing: state.outgoing.map((note) =>
      note.id === id ? { ...note, readback, readbackError: null } : note
    )
  }
}

/** 读失败保留同范围旧读数与时间；从未读到过则仍为未知。 */
export function failReadback(
  state: ReviewNotificationsState,
  id: string,
  error: string
): ReviewNotificationsState {
  return {
    ...state,
    outgoing: state.outgoing.map((note) =>
      note.id === id ? { ...note, readbackError: error } : note
    )
  }
}

export function applyIncomingReadback(
  state: ReviewNotificationsState,
  id: string,
  readback: ReviewReadback
): ReviewNotificationsState {
  return {
    ...state,
    incoming: state.incoming.map((note) =>
      note.id === id ? { ...note, readback, readbackError: null } : note
    )
  }
}

export function failIncomingReadback(
  state: ReviewNotificationsState,
  id: string,
  error: string
): ReviewNotificationsState {
  return {
    ...state,
    incoming: state.incoming.map((note) =>
      note.id === id ? { ...note, readbackError: error } : note
    )
  }
}

export type OutgoingReviewStatus = {
  merged: boolean | null
  openCommentCount: number | null
  prState: ReviewPrState | null
  checksState: ReviewCheckState | null
  checkedAt: string | null
  error: string | null
  canReRequest: boolean
}

export function deriveOutgoingStatus(note: ReviewOutgoingNote): OutgoingReviewStatus {
  return {
    merged: note.readback?.merged ?? null,
    openCommentCount: note.readback?.openCommentCount ?? null,
    prState: note.readback?.prState ?? null,
    checksState: note.readback?.checksState ?? null,
    checkedAt: note.readback?.checkedAt ?? null,
    error: note.readbackError,
    canReRequest:
      note.readback !== null &&
      note.readback.merged === false &&
      note.readback.openCommentCount !== null &&
      note.readback.openCommentCount > 0
  }
}

/**
 * 统计本轮起点之后的未解决检视意见。GitHub 以 review thread 为「已解决」
 * 单位：同一 thread 的多条评论按首条创建时间判断是否属于本轮，解决状态取
 * 该 thread 的 isResolved。只有会话评论、拿不到 thread 信息时返回 null
 * （未知），不把「没有 threadId」当成 0 条（spec 待决 3、N09）。
 */
export function countUnresolvedReviewCommentsSince(
  comments: readonly PRComment[],
  sinceIso: string
): number | null {
  const since = Date.parse(sinceIso)
  if (!Number.isFinite(since)) {
    return null
  }
  const threads = new Map<string, { firstCreatedAt: number; resolved: boolean }>()
  let threadCommentCount = 0
  let commentAfterStartWithoutThread = false
  for (const comment of comments) {
    const createdAt = Date.parse(comment.createdAt)
    if (!Number.isFinite(createdAt)) {
      continue
    }
    if (!comment.threadId) {
      if (createdAt > since) {
        commentAfterStartWithoutThread = true
      }
      continue
    }
    threadCommentCount += 1
    const thread = threads.get(comment.threadId)
    if (!thread) {
      threads.set(comment.threadId, {
        firstCreatedAt: createdAt,
        resolved: comment.isResolved === true
      })
    } else {
      thread.firstCreatedAt = Math.min(thread.firstCreatedAt, createdAt)
      thread.resolved = thread.resolved || comment.isResolved === true
    }
  }
  if (threadCommentCount === 0) {
    return commentAfterStartWithoutThread ? null : 0
  }
  let count = 0
  for (const thread of threads.values()) {
    if (thread.firstCreatedAt > since && !thread.resolved) {
      count += 1
    }
  }
  return count
}

export function totalUnreadBadgeCount(state: ReviewNotificationsState): number {
  return state.incoming.length + state.outgoing.length
}
