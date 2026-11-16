import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
export function MilestoneReviewButton({
  busy,
  writing,
  conflict,
  dirty,
  retry,
  validate,
  hasReview,
  reviewUrl,
  openReview,
  needsUpdate,
  changes,
  updateFormal,
  submit
}: {
  writing: boolean
  busy: boolean
  conflict: boolean
  dirty: boolean
  retry: boolean
  validate(): boolean
  hasReview: boolean
  reviewUrl?: string
  openReview?(): void
  needsUpdate: boolean
  changes: string[]
  updateFormal(): void
  submit(): void
}) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const viewReview =
    openReview ??
    (() => {
      if (reviewUrl) {
        void window.api.shell.openUrl(reviewUrl)
      }
    })
  const canViewReview = Boolean(reviewUrl || openReview)
  if (writing) {
    return (
      <Button size="xs" disabled aria-busy data-contextual-tour-target="milestone-submit">
        提交中…
      </Button>
    )
  }
  if (needsUpdate || (!dirty && !retry && (hasReview || canViewReview))) {
    return (
      <Button
        size="xs"
        className="bg-foreground text-background hover:bg-foreground/90"
        data-contextual-tour-target="milestone-submit"
        disabled={needsUpdate ? busy : !canViewReview}
        title={!needsUpdate && !canViewReview ? '评审链接尚未读到，请刷新后重试' : undefined}
        onClick={needsUpdate ? updateFormal : viewReview}
      >
        {needsUpdate ? '更新正式安排' : '查看评审'}
      </Button>
    )
  }
  return (
    <Popover
      open={reviewOpen}
      onOpenChange={(open) => {
        if (!open || validate()) {
          setReviewOpen(open)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="xs"
          className="bg-foreground text-background hover:bg-foreground/90"
          data-contextual-tour-target="milestone-submit"
          disabled={!canViewReview && (busy || conflict || (!dirty && !retry))}
        >
          {retry ? '重试提交' : hasReview ? '更新评审' : '提交评审'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="wb-ml-review" align="end">
        <strong>本次改动</strong>
        <ul>
          {changes.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        {retry && <p>重试推送已提交内容并创建评审。</p>}
        {canViewReview && (
          <Button variant="ghost" size="xs" onClick={viewReview}>
            查看评审
          </Button>
        )}
        <Button
          size="xs"
          className="bg-foreground text-background hover:bg-foreground/90"
          disabled={busy || conflict || (!dirty && !retry)}
          onClick={() => {
            if (validate()) {
              setReviewOpen(false)
              submit()
            }
          }}
        >
          确认提交
        </Button>
      </PopoverContent>
    </Popover>
  )
}
