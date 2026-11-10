import { useEffect, useState } from 'react'
import type {
  ReviewPeerTarget,
  ReviewSendInput
} from '../../../../shared/workbench/pr-review-request'
import { ReviewSendDialog } from './ReviewSendDialog'
import { useReviewSendDialog } from './send-dialog-store'
import { getReviewNotifications, sendReviewRequest } from './store'
import { reviewNoteId } from './model'
import { listConnectedReviewTargets } from './transport'

function SendDialog({
  request,
  onClose
}: {
  request: ReviewSendInput
  onClose: () => void
}): React.JSX.Element {
  const [available, setAvailable] = useState<ReviewPeerTarget[]>([])
  const [selected, setSelected] = useState<ReviewPeerTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState(request)
  useEffect(() => {
    let cancelled = false
    const state = getReviewNotifications()
    const id = reviewNoteId(request.repo, request.prNumber)
    const previous = state.outgoing.find((note) => note.id === id)
    const retry = state.pending.find(
      (attempt) => reviewNoteId(attempt.request.repo, attempt.request.prNumber) === id
    )
    const defaults = retry?.targets ?? previous?.deliveries
    setDraft(retry?.request ?? request)
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
  }, [request])
  async function send(): Promise<void> {
    if (sending) {
      return
    }
    setSending(true)
    setError(null)
    try {
      const result = await sendReviewRequest(draft, selected)
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
      request={draft}
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
