/**
 * 本机评审通知存档：localStorage 用户数据，不写项目仓库、不建业务数据库
 * （spec 持久化与失败）。损坏或旧结构的条目按字段校验丢弃，不让坏数据
 * 冒充通知。
 */
import type {
  ReviewPeerDelivery,
  ReviewRepoIdentity
} from '../../../../shared/workbench/pr-review-request'
import {
  EMPTY_REVIEW_NOTIFICATIONS,
  type ReviewCheckState,
  type ReviewIncomingNote,
  type ReviewNotificationsState,
  type ReviewOutgoingNote,
  type ReviewPrState,
  type ReviewReadback
} from './model'

const STORAGE_KEY = 'bw.pr-review-notifications.v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseRepo(value: unknown): ReviewRepoIdentity | null {
  if (!isRecord(value) || !isText(value.owner) || !isText(value.name)) {
    return null
  }
  if (value.host !== undefined && !isText(value.host)) {
    return null
  }
  return {
    owner: value.owner,
    name: value.name,
    ...(isText(value.host) ? { host: value.host } : {})
  }
}

function parseDeliveries(value: unknown): ReviewPeerDelivery[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(
    (entry): entry is ReviewPeerDelivery =>
      isRecord(entry) &&
      typeof entry.name === 'string' &&
      typeof entry.host === 'string' &&
      typeof entry.port === 'number' &&
      typeof entry.ok === 'boolean' &&
      (entry.status === null || typeof entry.status === 'number')
  )
}

function parsePrState(value: unknown): ReviewPrState | null {
  return value === 'open' || value === 'closed' || value === 'merged' || value === 'draft'
    ? value
    : null
}

function parseCheckState(value: unknown): ReviewCheckState | null {
  return value === 'success' || value === 'failure' || value === 'pending' || value === 'neutral'
    ? value
    : null
}

function parseReadback(value: unknown): ReviewReadback | null {
  if (!isRecord(value) || !isText(value.checkedAt)) {
    return null
  }
  const openCommentCount =
    typeof value.openCommentCount === 'number' && Number.isInteger(value.openCommentCount)
      ? value.openCommentCount
      : null
  const merged = typeof value.merged === 'boolean' ? value.merged : null
  return {
    openCommentCount,
    merged,
    prState: parsePrState(value.prState),
    checksState: parseCheckState(value.checksState),
    checkedAt: value.checkedAt
  }
}

function parseIncoming(value: unknown): ReviewIncomingNote | null {
  if (!isRecord(value)) {
    return null
  }
  const repo = parseRepo(value.repo)
  if (
    !repo ||
    !isText(value.id) ||
    typeof value.prNumber !== 'number' ||
    !Number.isInteger(value.prNumber) ||
    !isText(value.title) ||
    !isText(value.sourceBranch) ||
    !isText(value.targetBranch) ||
    !isText(value.sender) ||
    typeof value.round !== 'number' ||
    !Number.isInteger(value.round) ||
    !isText(value.sentAt) ||
    !isText(value.receivedAt)
  ) {
    return null
  }
  return {
    id: value.id,
    repo,
    prNumber: value.prNumber,
    title: value.title,
    sourceBranch: value.sourceBranch,
    targetBranch: value.targetBranch,
    sender: value.sender,
    round: value.round,
    sentAt: value.sentAt,
    receivedAt: value.receivedAt,
    readback: parseReadback(value.readback),
    readbackError: isText(value.readbackError) ? value.readbackError : null
  }
}

function parseOutgoing(value: unknown): ReviewOutgoingNote | null {
  if (!isRecord(value)) {
    return null
  }
  const repo = parseRepo(value.repo)
  if (
    !repo ||
    !isText(value.id) ||
    typeof value.prNumber !== 'number' ||
    !Number.isInteger(value.prNumber) ||
    !isText(value.title) ||
    !isText(value.sourceBranch) ||
    !isText(value.targetBranch) ||
    typeof value.round !== 'number' ||
    !Number.isInteger(value.round) ||
    !isText(value.roundStartedAt) ||
    !isText(value.sentAt)
  ) {
    return null
  }
  return {
    id: value.id,
    repo,
    prNumber: value.prNumber,
    title: value.title,
    sourceBranch: value.sourceBranch,
    targetBranch: value.targetBranch,
    round: value.round,
    roundStartedAt: value.roundStartedAt,
    sentAt: value.sentAt,
    deliveries: parseDeliveries(value.deliveries),
    readback: parseReadback(value.readback),
    readbackError: isText(value.readbackError) ? value.readbackError : null
  }
}

export function readStoredReviewNotifications(): ReviewNotificationsState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return EMPTY_REVIEW_NOTIFICATIONS
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return EMPTY_REVIEW_NOTIFICATIONS
    }
    const incoming = Array.isArray(parsed.incoming)
      ? parsed.incoming
          .map(parseIncoming)
          .filter((note): note is ReviewIncomingNote => note !== null)
      : []
    const outgoing = Array.isArray(parsed.outgoing)
      ? parsed.outgoing
          .map(parseOutgoing)
          .filter((note): note is ReviewOutgoingNote => note !== null)
      : []
    return { incoming, outgoing }
  } catch {
    return EMPTY_REVIEW_NOTIFICATIONS
  }
}

export function writeStoredReviewNotifications(state: ReviewNotificationsState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota/serialization failure: keep the in-memory copy for this session.
  }
}
