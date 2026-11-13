import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CHARTER_LABELS, type ProjectCharter } from './project-charter'

type ReviewFields = {
  changes: readonly (keyof typeof CHARTER_LABELS)[]
  value: ProjectCharter
  localOnly: boolean
  disabled?: boolean
  onConfirm(): void
}

export function ProjectSettingsReviewSummary({
  changes,
  value,
  localOnly,
  disabled,
  onConfirm
}: ReviewFields) {
  return (
    <>
      <strong>本次修改</strong>
      <ul>
        {changes.map((field) => (
          <li key={field}>
            {CHARTER_LABELS[field]}：{(value[field] ?? '').trim() || '留空'}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="wb-btn wb-btn-primary"
        disabled={disabled}
        onClick={onConfirm}
      >
        {localOnly ? '确认保存' : '确认提交'}
      </button>
    </>
  )
}

export function ProjectSettingsReview({
  value,
  changes,
  localOnly,
  busy,
  disabled,
  onConfirm
}: Omit<ReviewFields, 'value'> & { value: ProjectCharter | null; busy: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="wb-btn wb-btn-primary" disabled={disabled}>
          {busy ? '提交中…' : localOnly ? '保存' : '提交评审'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="确认项目信息变更"
        className="wb-ml-review max-h-[min(28rem,70vh)] overflow-auto scrollbar-sleek break-words"
        align="end"
      >
        {value && (
          <ProjectSettingsReviewSummary
            changes={changes}
            value={value}
            localOnly={localOnly}
            disabled={disabled}
            onConfirm={() => {
              setOpen(false)
              onConfirm()
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
