import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import {
  ReviewRequestSchema,
  type ReviewSendInput,
  type ReviewPeerTarget,
  type ReviewSendResult
} from '../../../../shared/workbench/pr-review-request'
import {
  applyIncomingRequest,
  applyReviewReadback,
  deleteOutgoingNote,
  recordSentReview,
  reviewNoteId,
  reviewReadbackKey,
  EMPTY_REVIEW_NOTIFICATIONS,
  type ReviewNotificationsState,
  type ReviewIncomingNote,
  type ReviewOutgoingNote
} from './model'
import { findRegisteredReviewRepo, readReviewTracking } from './review-target'
import { readStoredReviewNotifications, writeStoredReviewNotifications } from './storage'
import { deliverReviewRequest, readReviewInbox, readReviewSender } from './transport'

let state: ReviewNotificationsState = EMPTY_REVIEW_NOTIFICATIONS
let storageError: string | null = null
try {
  state = readStoredReviewNotifications()
} catch {
  storageError = '本机通知存档无法读取，未覆盖原文件'
}
const listeners = new Set<() => void>()
const lastRefreshAt = new Map<string, number>()
const inFlightRefresh = new Set<string>()
const sending = new Set<string>()

function setState(next: ReviewNotificationsState, persist = false): void {
  if (next === state) {
    return
  }
  if (persist) {
    if (storageError) {
      throw new Error(storageError)
    }
    writeStoredReviewNotifications(next)
  }
  state = next
  for (const listener of listeners) {
    listener()
  }
}
export const getReviewNotifications = (): ReviewNotificationsState => state
export function subscribeReviewNotifications(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function useReviewNotifications(): ReviewNotificationsState {
  return useSyncExternalStore(subscribeReviewNotifications, getReviewNotifications)
}
export async function sendReviewRequest(
  input: ReviewSendInput,
  targets: ReviewPeerTarget[]
): Promise<ReviewSendResult> {
  const id = reviewNoteId(input.repo, input.prNumber)
  if (sending.has(id)) {
    throw new Error('这条评审请求正在发送')
  }
  if (storageError) {
    throw new Error(storageError)
  }
  sending.add(id)
  try {
    writeStoredReviewNotifications(state)
    const previous = state.outgoing.find((note) => note.id === id)
    if (!targets.length) {
      throw new Error('请选择收件主机，尚未发送')
    }
    const { sender } = await readReviewSender()
    const sentAt = new Date().toISOString()
    const pending = state.pending.find(
      (attempt) => reviewNoteId(attempt.request.repo, attempt.request.prNumber) === id
    )
    const request =
      pending?.request ??
      ReviewRequestSchema.parse({
        ...input,
        sender,
        sentAt,
        cycleId: previous?.cycleId ?? crypto.randomUUID(),
        cycleStartedAt: previous?.cycleStartedAt ?? sentAt,
        round: (previous?.round ?? 0) + 1
      })
    // A lost acknowledgement must retry the exact request that may already be durable on a peer.
    setState(
      {
        ...state,
        pending: [{ request, targets }, ...state.pending.filter((attempt) => attempt !== pending)]
      },
      true
    )
    const result = await deliverReviewRequest(request, targets)
    if (result.results.some((entry) => entry.ok)) {
      try {
        setState(recordSentReview(state, request, result.results), true)
      } catch (error) {
        throw new Error(
          `请求已送达部分或全部主机，但本机存档失败：${error instanceof Error ? error.message : String(error)}`
        )
      }
      const note = state.outgoing.find((item) => item.id === id)
      if (note) {
        void refreshOutgoingReview(note, { force: true })
      }
    }
    const failed = result.results.filter((entry) => !entry.ok)
    const delivered = result.results.length - failed.length
    if (failed.length) {
      toast.error(
        `评审请求送达 ${delivered}/${result.results.length}：${failed.map((entry) => `${entry.name}: ${entry.error}`).join('；')}`
      )
    } else {
      toast.success(`评审请求已送达 ${delivered} 台主机`)
    }
    return result
  } finally {
    sending.delete(id)
  }
}
export function deleteReviewNotification(id: string): void {
  if (sending.has(id)) {
    toast.error('请求正在发送，请稍后删除')
    return
  }
  try {
    setState(deleteOutgoingNote(state, id), true)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function refreshNoteReadback(
  note: ReviewIncomingNote | ReviewOutgoingNote,
  direction: 'incoming' | 'outgoing',
  options?: { force?: boolean }
): Promise<void> {
  const key = reviewReadbackKey(note)
  const flightKey = `${direction}:${key}`
  if (
    inFlightRefresh.has(flightKey) ||
    (!options?.force && Date.now() - (lastRefreshAt.get(flightKey) ?? 0) < 30_000)
  ) {
    return
  }
  inFlightRefresh.add(flightKey)
  lastRefreshAt.set(flightKey, Date.now())
  try {
    const repo = findRegisteredReviewRepo(note.repo)
    if (!repo) {
      throw new Error('暂时无法访问该项目')
    }
    const readback = await readReviewTracking(repo, note.prNumber, note.sentAt)
    setState(applyReviewReadback(state, direction, key, readback, null))
  } catch (error) {
    setState(
      applyReviewReadback(
        state,
        direction,
        key,
        null,
        error instanceof Error ? error.message : String(error)
      )
    )
  } finally {
    inFlightRefresh.delete(flightKey)
    if (lastRefreshAt.size > 500) {
      lastRefreshAt.delete(lastRefreshAt.keys().next().value!)
    }
  }
}
export const refreshOutgoingReview = (note: ReviewOutgoingNote, options?: { force?: boolean }) =>
  refreshNoteReadback(note, 'outgoing', options)
export const refreshIncomingReview = (note: ReviewIncomingNote, options?: { force?: boolean }) =>
  refreshNoteReadback(note, 'incoming', options)
export const refreshAllOutgoingReviews = (options?: { force?: boolean }) =>
  Promise.all(state.outgoing.map((note) => refreshOutgoingReview(note, options)))
export const refreshAllIncomingReviews = (options?: { force?: boolean }) =>
  Promise.all(state.incoming.map((note) => refreshIncomingReview(note, options)))

export function installReviewNotificationListeners(
  onError: (message: string | null) => void
): () => void {
  let stopped = false
  let reading = false
  const sync = async (): Promise<void> => {
    if (reading) {
      return
    }
    reading = true
    try {
      const requests = await readReviewInbox()
      if (stopped) {
        return
      }
      onError(storageError)
      for (const request of requests) {
        const next = applyIncomingRequest(state, request)
        if (next === state) {
          continue
        }
        setState(next)
        const note = state.incoming.find(
          (item) => item.id === reviewNoteId(request.repo, request.prNumber)
        )
        if (note) {
          void refreshIncomingReview(note, { force: true })
        }
      }
    } catch (error) {
      if (!stopped) {
        onError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      reading = false
    }
  }
  void sync()
  const timer = window.setInterval(() => void sync(), 5000)
  window.addEventListener('focus', sync)
  return () => {
    stopped = true
    window.clearInterval(timer)
    window.removeEventListener('focus', sync)
  }
}
