import { MultiSelectList } from '@/components/github/PRFilterPickers'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type {
  ReviewPeerTarget,
  ReviewSendInput
} from '../../../../shared/workbench/pr-review-request'

export const reviewPeerKey = (target: ReviewPeerTarget): string =>
  `${target.environmentId}:${target.pairingRevision}`

export function ReviewSendDialog({
  request,
  available,
  selected,
  loading,
  sending,
  error,
  onChange,
  onClose,
  onSend
}: {
  request: ReviewSendInput
  available: ReviewPeerTarget[]
  selected: ReviewPeerTarget[]
  loading: boolean
  sending: boolean
  error: string | null
  onChange: (targets: ReviewPeerTarget[]) => void
  onClose: () => void
  onSend: () => void
}): React.JSX.Element {
  const availableKeys = new Set(available.map(reviewPeerKey))
  const unavailable = selected.filter((target) => !availableKeys.has(reviewPeerKey(target)))
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !sending) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>发送评审</DialogTitle>
          <DialogDescription>
            {request.repo.path} #{request.prNumber} · {request.title}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>收件主机 · 已选 {selected.length} 台</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading || sending || !available.length}
            onClick={() =>
              onChange([
                ...available,
                ...unavailable.filter(
                  (old) => !available.some((target) => target.environmentId === old.environmentId)
                )
              ])
            }
          >
            全选已连接
          </Button>
        </div>
        <fieldset
          disabled={sending || loading}
          className="min-w-0 rounded-md border border-border disabled:opacity-60"
        >
          <MultiSelectList
            options={available.map((target) => ({
              key: reviewPeerKey(target),
              primary: target.name
            }))}
            selected={selected.map(reviewPeerKey)}
            loading={loading}
            error={error}
            searchPlaceholder="搜索已连接主机…"
            emptyText="没有已连接主机"
            onChange={(keys) => {
              if (!loading && !sending) {
                const chosen = available.filter((target) => keys.includes(reviewPeerKey(target)))
                onChange([
                  ...chosen,
                  ...unavailable.filter(
                    (target) =>
                      keys.includes(reviewPeerKey(target)) &&
                      !chosen.some((next) => next.environmentId === target.environmentId)
                  )
                ])
              }
            }}
          />
        </fieldset>
        {unavailable.length && !loading ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            {unavailable.map((target) => (
              <div key={reviewPeerKey(target)} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{target.name} · 未连接或配对已变更</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sending}
                  onClick={() =>
                    onChange(
                      selected.filter((item) => reviewPeerKey(item) !== reviewPeerKey(target))
                    )
                  }
                >
                  移除
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={sending} onClick={onClose}>
            取消
          </Button>
          <Button disabled={loading || sending || !selected.length} onClick={onSend}>
            {sending ? '正在发送…' : `发送至 ${selected.length} 台主机`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
