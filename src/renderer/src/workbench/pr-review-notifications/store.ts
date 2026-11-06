/**
 * pr-review-notify 渲染层状态：模块级 store + useSyncExternalStore。
 * 待我评审/发出通知写 localStorage；PR 动态每次按触发点重新读回，不把
 * 读数当持久结果（spec 持久化与失败）。
 */
import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import type {
  ReviewIncomingRequest,
  ReviewRepoIdentity,
  ReviewSendInput,
  ReviewSendResult
} from '../../../../shared/workbench/pr-review-request'
import {
  applyIncomingReadback,
  applyIncomingRequest,
  applyReadback,
  deleteOutgoingNote,
  failIncomingReadback,
  failReadback,
  recordSentReview,
  reviewNoteId,
  type ReviewIncomingNote,
  type ReviewNotificationsState,
  type ReviewOutgoingNote,
  type ReviewReadback
} from './model'
import { findRegisteredReviewRepo, readReviewTracking } from './review-target'
import { readStoredReviewNotifications, writeStoredReviewNotifications } from './storage'

let state: ReviewNotificationsState = readStoredReviewNotifications()
const listeners = new Set<() => void>()
/** 自动读回节流：同一条通知 30 秒内不重复打 GitHub。 */
const lastRefreshAt = new Map<string, number>()
const inFlightRefresh = new Set<string>()
const AUTO_REFRESH_MIN_INTERVAL_MS = 30_000

function setState(next: ReviewNotificationsState): void {
  state = next
  writeStoredReviewNotifications(next)
  for (const listener of listeners) {
    listener()
  }
}

export function getReviewNotifications(): ReviewNotificationsState {
  return state
}

export function subscribeReviewNotifications(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useReviewNotifications(): ReviewNotificationsState {
  return useSyncExternalStore(subscribeReviewNotifications, getReviewNotifications)
}

function deliveryFailureLines(result: ReviewSendResult): string[] {
  return result.results
    .filter((entry) => !entry.ok)
    .map(
      (entry) =>
        `${entry.name || `${entry.host}:${entry.port}`}: ${entry.error ?? `HTTP ${entry.status ?? '—'}`}`
    )
}

function reportSendResult(result: ReviewSendResult, action: string): void {
  if (result.results.length === 0) {
    toast.error(`${action}未送达：本机没有配置可送达的同伴主机（review-peers.json）`)
    return
  }
  const failed = deliveryFailureLines(result)
  if (failed.length === 0) {
    toast.success(`评审请求已送达 ${result.results.length} 位同伴`)
    return
  }
  const delivered = result.results.length - failed.length
  toast.error(
    delivered > 0
      ? `${action}部分送达（${delivered}/${result.results.length}）\n${failed.join('\n')}`
      : `${action}失败\n${failed.join('\n')}`
  )
}

export function receiveIncomingRequest(request: ReviewIncomingRequest): void {
  setState(applyIncomingRequest(state, request))
}

/** 发送评审；至少一个目标成功才落通知，失败保持原轮次与意见数。 */
export async function sendReviewRequest(
  input: ReviewSendInput,
  round: number
): Promise<ReviewSendResult> {
  const result = await window.api.bwReview.send(input)
  if (result.results.some((entry) => entry.ok)) {
    setState(recordSentReview(state, input, round, result.sentAt, result.results))
    const note = state.outgoing.find((item) => item.id === reviewNoteId(input.repo, input.prNumber))
    if (note) {
      void refreshOutgoingReview(note, { force: true })
    }
  }
  reportSendResult(result, round > 1 ? '再发起评审' : '发送评审')
  return result
}

/** 同一 PR 已有发出通知时再次发送视为新一轮，否则从第 1 轮开始。 */
export function nextReviewRound(repo: ReviewRepoIdentity, prNumber: number): number {
  const id = reviewNoteId(repo, prNumber)
  return (state.outgoing.find((note) => note.id === id)?.round ?? 0) + 1
}

export function deleteReviewNotification(id: string): void {
  setState(deleteOutgoingNote(state, id))
}

type ReadbackTarget = {
  id: string
  repo: ReviewOutgoingNote['repo']
  prNumber: number
}

type ReadbackHandlers = {
  key: string
  since: string
  apply: (
    current: ReviewNotificationsState,
    id: string,
    readback: ReviewReadback
  ) => ReviewNotificationsState
  fail: (current: ReviewNotificationsState, id: string, error: string) => ReviewNotificationsState
}

async function refreshNoteReadback(
  note: ReadbackTarget,
  handlers: ReadbackHandlers,
  options?: { force?: boolean }
): Promise<void> {
  const now = Date.now()
  const last = lastRefreshAt.get(handlers.key) ?? 0
  if (!options?.force && now - last < AUTO_REFRESH_MIN_INTERVAL_MS) {
    return
  }
  // Why: 面板打开与窗口聚焦可能同时触发，同一通知只保留一次在途读回。
  if (inFlightRefresh.has(handlers.key)) {
    return
  }
  inFlightRefresh.add(handlers.key)
  lastRefreshAt.set(handlers.key, now)
  try {
    const repo = findRegisteredReviewRepo(note.repo, note.prNumber)
    if (!repo) {
      setState(handlers.fail(state, note.id, '本机没有该项目'))
      return
    }
    const readback = await readReviewTracking(repo, note.prNumber, handlers.since)
    setState(handlers.apply(state, note.id, readback))
  } catch (error) {
    setState(handlers.fail(state, note.id, error instanceof Error ? error.message : String(error)))
  } finally {
    inFlightRefresh.delete(handlers.key)
  }
}

export async function refreshOutgoingReview(
  note: ReviewOutgoingNote,
  options?: { force?: boolean }
): Promise<void> {
  await refreshNoteReadback(
    note,
    {
      key: `outgoing:${note.id}`,
      since: note.roundStartedAt,
      apply: applyReadback,
      fail: failReadback
    },
    options
  )
}

export async function refreshIncomingReview(
  note: ReviewIncomingNote,
  options?: { force?: boolean }
): Promise<void> {
  await refreshNoteReadback(
    note,
    {
      key: `incoming:${note.id}`,
      since: note.sentAt,
      apply: applyIncomingReadback,
      fail: failIncomingReadback
    },
    options
  )
}

export async function refreshAllOutgoingReviews(options?: { force?: boolean }): Promise<void> {
  await Promise.all(state.outgoing.map((note) => refreshOutgoingReview(note, options)))
}

export async function refreshAllIncomingReviews(options?: { force?: boolean }): Promise<void> {
  await Promise.all(state.incoming.map((note) => refreshIncomingReview(note, options)))
}

/** 挂载时接收新请求并补拉渲染层就绪前排队的请求；返回卸载清理。 */
export function installReviewNotificationListeners(): () => void {
  if (!window.api.bwReview) {
    return () => undefined
  }
  const unsubscribe = window.api.bwReview.onReceived(receiveIncomingRequest)
  void window.api.bwReview
    .pending()
    .then((requests) => {
      for (const request of requests) {
        receiveIncomingRequest(request)
      }
    })
    .catch(() => undefined)
  return unsubscribe
}
