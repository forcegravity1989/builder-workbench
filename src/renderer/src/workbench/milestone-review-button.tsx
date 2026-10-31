import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
export function MilestoneReviewButton({
  busy,
  conflict,
  dirty,
  retry,
  invalid,
  hasReview,
  reviewUrl,
  needsUpdate,
  changes,
  updateFormal,
  submit
}: {
  busy: boolean
  conflict: boolean
  dirty: boolean
  retry: boolean
  invalid: boolean
  hasReview: boolean
  reviewUrl?: string
  needsUpdate: boolean
  changes: string[]
  updateFormal(): void
  submit(): void
}) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const viewReview = () => {
    if (reviewUrl) {
      void window.api.shell.openUrl(reviewUrl)
    }
  }
  if (needsUpdate || (!dirty && !retry && (hasReview || reviewUrl))) {
    return (
      <Button
        size="xs"
        className="bg-foreground text-background hover:bg-foreground/90"
        disabled={needsUpdate ? busy : !reviewUrl}
        title={!needsUpdate && !reviewUrl ? '评审链接尚未读到，请刷新后重试' : undefined}
        onClick={needsUpdate ? updateFormal : viewReview}
      >
        {needsUpdate ? '更新正式安排' : '查看评审'}
      </Button>
    )
  }
  return (
    <Popover open={reviewOpen} onOpenChange={setReviewOpen}>
      <PopoverTrigger asChild>
        <Button
          size="xs"
          className="bg-foreground text-background hover:bg-foreground/90"
          disabled={!reviewUrl && (busy || conflict || (!dirty && !retry) || invalid)}
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
        {reviewUrl && (
          <Button variant="ghost" size="xs" onClick={viewReview}>
            查看评审
          </Button>
        )}
        <Button
          size="xs"
          className="bg-foreground text-background hover:bg-foreground/90"
          disabled={busy || conflict || (!dirty && !retry) || invalid}
          onClick={() => {
            setReviewOpen(false)
            submit()
          }}
        >
          确认提交
        </Button>
      </PopoverContent>
    </Popover>
  )
}
