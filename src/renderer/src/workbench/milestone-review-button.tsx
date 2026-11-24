import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
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
  changes,
  blockedReason,
  secondary = false,
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
  changes: string[]
  blockedReason?: string
  secondary?: boolean
  submit(): void
}) {
  const [open, setOpen] = useState(false)
  const submittable = dirty || retry
  useEffect(() => {
    if (!submittable) {
      setOpen(false)
    }
  }, [submittable])
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
  if (!dirty && !retry && (hasReview || canViewReview)) {
    const reason = !canViewReview
      ? '评审链接尚未读到，请重试读取'
      : busy
        ? blockedReason
        : undefined
    return (
      <span className="inline-flex" title={busy || !canViewReview ? reason : undefined}>
        <Button
          size="xs"
          variant={secondary ? 'outline' : 'default'}
          data-contextual-tour-target="milestone-submit"
          disabled={busy || !canViewReview}
          onClick={viewReview}
        >
          查看评审
        </Button>
      </span>
    )
  }
  const triggerDisabled = !canViewReview && (busy || conflict || !submittable)
  const confirmDisabled = busy || conflict || !submittable
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next || validate()) {
          setOpen(next)
        }
      }}
    >
      <span
        className="inline-flex"
        title={triggerDisabled ? (blockedReason ?? '没有可提交的改动') : undefined}
      >
        <PopoverTrigger asChild>
          <Button
            size="xs"
            variant={secondary ? 'outline' : 'default'}
            data-contextual-tour-target="milestone-submit"
            disabled={triggerDisabled}
          >
            {retry ? '重试提交' : hasReview ? '更新评审' : '提交评审'}
          </Button>
        </PopoverTrigger>
      </span>
      <PopoverContent className="wb-ml-review" align="end">
        <strong>本次改动</strong>
        <ul>
          {changes.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        {retry && <p>重试推送已提交内容并创建评审。</p>}
        {confirmDisabled && blockedReason && <p role="status">{blockedReason}</p>}
        {canViewReview && (
          <Button variant="ghost" size="xs" onClick={viewReview}>
            查看评审
          </Button>
        )}
        <Button
          size="xs"
          className="bg-foreground text-background hover:bg-foreground/90"
          disabled={confirmDisabled}
          onClick={() => {
            if (validate()) {
              setOpen(false)
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
