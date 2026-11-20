import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { notifyWorkbenchError } from '../error-feedback'
import {
  PrototypeReviewRequestSchema,
  type PrototypeReviewPageRef
} from '../../../../../shared/workbench/prototype-review-request'
import type { ReviewPeerTarget } from '../../../../../shared/workbench/pr-review-request'
import {
  deletePrototypeOutgoing,
  EMPTY_PROTOTYPE_REVIEW_STATE,
  recordSentPrototypeReview,
  reconcileIncomingPrototypeReviews,
  removePrototypeIncoming,
  type PrototypeReviewIncomingNote,
  type PrototypeReviewOutgoingNote,
  type PrototypeReviewState
} from './prototype-model'
import {
  readStoredPrototypeReviewNotifications,
  writeStoredPrototypeReviewNotifications
} from './prototype-storage'
import {
  deliverPrototypeReviewRequest,
  dismissPrototypeReviewInbox,
  readPrototypeReviewInbox,
  readPrototypeReviewSender
} from './prototype-transport'
import type { PrototypeReviewSendResult } from './prototype-transport'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { canonicalPrototypeReviewDocumentKey } from '../../../../../shared/workbench/prototype-review-annotation'
import { useAppStore } from '@/store'

let state: PrototypeReviewState = EMPTY_PROTOTYPE_REVIEW_STATE
let storageError: string | null = null
try {
  state = readStoredPrototypeReviewNotifications()
} catch {
  storageError = '本机原型评审通知存档无法读取，未覆盖原文件'
}
const listeners = new Set<() => void>()
const sending = new Set<string>()
let inboxGeneration = 0

function setState(next: PrototypeReviewState, persist = false): void {
  if (next === state) {
    return
  }
  if (persist) {
    if (storageError) {
      throw new Error(storageError)
    }
    writeStoredPrototypeReviewNotifications(next)
  }
  state = next
  for (const listener of listeners) {
    listener()
  }
}

export const getPrototypeReviewNotifications = (): PrototypeReviewState => state
export function hasPrototypeReviewPage(browserPageId: string): boolean {
  return (
    state.outgoing.some((note) => note.page.browserPageId === browserPageId) ||
    state.incoming.some((note) => note.page.browserPageId === browserPageId)
  )
}
export function subscribePrototypeReviewNotifications(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function usePrototypeReviewNotifications(): PrototypeReviewState {
  return useSyncExternalStore(
    subscribePrototypeReviewNotifications,
    getPrototypeReviewNotifications
  )
}

export async function sendPrototypeReview(
  page: PrototypeReviewPageRef,
  targets: ReviewPeerTarget[]
): Promise<PrototypeReviewSendResult> {
  const draft = PrototypeReviewRequestSchema.pick({ page: true }).parse({ page })
  const id = `${page.sourceEnvironmentId}:${page.browserPageId}`
  if (sending.has(id)) {
    throw new Error('这条原型评审通知正在发送')
  }
  if (storageError) {
    throw new Error(storageError)
  }
  if (!targets.length) {
    throw new Error('请选择收件主机，尚未发送')
  }
  sending.add(id)
  try {
    const { sender } = await readPrototypeReviewSender()
    const enrichedPage = await enrichPrototypeReviewPage(page)
    const sentAt = new Date().toISOString()
    const previous = state.outgoing.find((note) => note.page.browserPageId === page.browserPageId)
    const request = PrototypeReviewRequestSchema.parse({
      event: 'prototype-review',
      page: { ...draft.page, ...enrichedPage },
      sender,
      sentAt,
      cycleId: previous?.cycleId ?? crypto.randomUUID(),
      cycleStartedAt: previous?.cycleStartedAt ?? sentAt,
      round: (previous?.round ?? 0) + 1
    })
    setState(
      {
        ...state,
        pending: [{ request, targets }, ...state.pending]
      },
      true
    )
    const result = await deliverPrototypeReviewRequest(request, targets)
    if (result.results.some((entry) => entry.ok)) {
      setState(recordSentPrototypeReview(state, request, result.results), true)
      await mirrorExistingLocalAnnotations(request.page)
    }
    const failed = result.results.filter((entry) => !entry.ok)
    if (failed.length) {
      notifyWorkbenchError(
        `原型评审通知送达 ${result.results.length - failed.length}/${result.results.length} 台主机`,
        failed.map((entry) => `${entry.name}：${entry.error}`).join('\n'),
        '检查未送达主机的连接后重试。'
      )
    } else {
      toast.success(`原型评审通知已送达 ${result.results.length} 台主机`)
    }
    return result
  } finally {
    sending.delete(id)
  }
}

async function mirrorExistingLocalAnnotations(page: PrototypeReviewRequest['page']): Promise<void> {
  const annotations = useAppStore.getState().browserAnnotationsByPageId[page.browserPageId] ?? []
  const documentKey = canonicalPrototypeReviewDocumentKey(page.documentKey)
  await Promise.all(
    annotations.map((annotation) =>
      callRuntimeRpc(
        { kind: 'local' },
        'workbench.prototypeReview.annotations.add',
        {
          worktree: toRuntimeWorktreeSelector(page.worktreeId),
          page: page.browserPageId,
          id: annotation.id,
          documentKey,
          comment: annotation.comment,
          x: annotation.payload.target.rectPage.x,
          y: annotation.payload.target.rectPage.y,
          label: annotation.payload.target.textSnippet || undefined
        },
        { timeoutMs: 15_000, suppressFeatureInteraction: true }
      ).catch(() => undefined)
    )
  )
}

export function deletePrototypeReviewNotification(id: string): void {
  try {
    setState(deletePrototypeOutgoing(state, id), true)
  } catch (error) {
    notifyWorkbenchError('无法删除原型评审通知', error, '可稍后重试。')
  }
}

export function dismissIncomingPrototypeReview(note: PrototypeReviewIncomingNote): void {
  inboxGeneration += 1
  void dismissPrototypeReviewInbox(note.id, note.receivedAt)
    .then(() => setState(removePrototypeIncoming(state, note.id)))
    .catch((error) => notifyWorkbenchError('无法删除原型评审通知', error, '可稍后重试。'))
}

export function installPrototypeReviewNotificationListeners(
  onError: (message: string | null) => void
): () => void {
  let stopped = false
  let reading = false
  const sync = async (): Promise<void> => {
    if (reading) {
      return
    }
    reading = true
    const generation = inboxGeneration
    try {
      const requests = await readPrototypeReviewInbox()
      if (stopped || generation !== inboxGeneration) {
        return
      }
      onError(storageError)
      const next = reconcileIncomingPrototypeReviews(state, requests)
      if (next !== state) {
        setState(next)
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

export async function refreshPrototypeReviewNotifications(): Promise<void> {
  const requests = await readPrototypeReviewInbox()
  setState(reconcileIncomingPrototypeReviews(state, requests))
}

export type { PrototypeReviewIncomingNote, PrototypeReviewOutgoingNote }
