import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
export function MilestoneReviewButton({
  busy,
  conflict,
  dirty,
  retry,
  invalid,
  hasReview,
  changes,
  submit
}: {
  busy: boolean
  conflict: boolean
  dirty: boolean
  retry: boolean
  invalid: boolean
  hasReview: boolean
  changes: string[]
  submit(): void
}) {
  const [reviewOpen, setReviewOpen] = useState(false)
  return (
    <Popover open={reviewOpen} onOpenChange={setReviewOpen}>
      <PopoverTrigger asChild>
        <button
          className="wb-btn wb-btn-primary wb-btn-sm"
          disabled={busy || conflict || (!dirty && !retry) || invalid}
        >
          {retry ? '重试提交' : hasReview ? '更新评审' : '提交评审'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="wb-ml-review" align="end">
        <strong>本次改动</strong>
        <ul>
          {changes.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        {retry && <p>重试推送已提交内容并创建评审。</p>}
        <button
          className="wb-btn wb-btn-primary"
          disabled={busy}
          onClick={() => {
            setReviewOpen(false)
            submit()
          }}
        >
          确认提交
        </button>
      </PopoverContent>
    </Popover>
  )
}
