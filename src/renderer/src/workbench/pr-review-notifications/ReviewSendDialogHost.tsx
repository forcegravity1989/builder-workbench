import { useEffect, useState } from 'react'
import type {
  ReviewPeerTarget,
  ReviewSendInput
} from '../../../../shared/workbench/pr-review-request'
import { ReviewSendDialog } from './ReviewSendDialog'
import { useReviewSendDialog, type ReviewSendDialogRequest } from './send-dialog-store'
import { getReviewNotifications, sendReviewRequest } from './store'
import { reviewNoteId } from './model'
import { listConnectedReviewTargets } from './transport'
import { getPrototypeReviewNotifications, sendPrototypeReview } from './prototype-store'

function SendDialog({
  request,
  onClose
}: {
  request: ReviewSendDialogRequest
  onClose: () => void
}): React.JSX.Element {
  const [available, setAvailable] = useState<ReviewPeerTarget[]>([])
  const [selected, setSelected] = useState<ReviewPeerTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPrototype = request.kind === 'prototype'
  const prRequest = request.kind === 'pr' ? request.request : null
  const prototypePage = request.kind === 'prototype' ? request.page : null
  const [draft, setDraft] = useState<ReviewSendInput | null>(prRequest)
  useEffect(() => {
    let cancelled = false
    let defaults: ReviewPeerTarget[] | undefined
    let retryPr: ReviewSendInput | undefined
    if (isPrototype && prototypePage) {
      const state = getPrototypeReviewNotifications()
      const sameInvite = (note: { purpose: string; page: typeof prototypePage }): boolean =>
        note.purpose === 'invite' &&
        note.page.sourceEnvironmentId === prototypePage.sourceEnvironmentId &&
        note.page.documentKey === prototypePage.documentKey
      const previous = state.outgoing.find(sameInvite)
      const retry = state.pending.find((attempt) => sameInvite(attempt.request))
      defaults = retry?.targets ?? previous?.deliveries
    } else if (prRequest) {
      const state = getReviewNotifications()
      const id = reviewNoteId(prRequest.repo, prRequest.prNumber)
      const previous = state.outgoing.find((note) => note.id === id)
      const retry = state.pending.find(
        (attempt) => reviewNoteId(attempt.request.repo, attempt.request.prNumber) === id
      )
      defaults = retry?.targets ?? previous?.deliveries
      retryPr = retry?.request
    }
    setDraft(isPrototype ? null : (retryPr ?? prRequest))
    setSelected(defaults ?? [])
    void listConnectedReviewTargets()
      .then((targets) => {
        if (!cancelled) {
          setAvailable(targets)
          setSelected(defaults ?? targets)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isPrototype, prRequest, prototypePage, request])
  async function send(): Promise<void> {
    if (sending) {
      return
    }
    setSending(true)
    setError(null)
    try {
      const result =
        isPrototype && prototypePage
          ? await sendPrototypeReview(prototypePage, selected)
          : draft
            ? await sendReviewRequest(draft, selected)
            : { results: [] }
      if (result.results.some((target) => target.ok)) {
        onClose()
      } else {
        setError(result.results.map((target) => `${target.name}：${target.error}`).join('；'))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSending(false)
    }
  }
  return (
    <ReviewSendDialog
      request={
        isPrototype && prototypePage
          ? { kind: 'prototype', page: prototypePage }
          : { kind: 'pr', request: draft! }
      }
      available={available}
      selected={selected}
      loading={loading}
      sending={sending}
      error={error}
      onChange={setSelected}
      onClose={onClose}
      onSend={() => void send()}
    />
  )
}

export function ReviewSendDialogHost(): React.JSX.Element | null {
  const { request, close } = useReviewSendDialog()
  return request ? <SendDialog request={request} onClose={close} /> : null
}
