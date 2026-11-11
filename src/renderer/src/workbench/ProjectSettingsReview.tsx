import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { useProjectSettings } from './use-project-settings'
import { CHARTER_LABELS } from './project-charter'

export function ProjectSettingsReview({
  model,
  onSubmitted
}: {
  model: ReturnType<typeof useProjectSettings>
  onSubmitted(): void
}) {
  const [open, setOpen] = useState(false)
  const disabled =
    model.busy ||
    model.loading ||
    !model.status ||
    !model.canEdit ||
    !model.dirty ||
    !model.form?.value.name.trim()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="wb-btn wb-btn-primary" disabled={disabled}>
          {model.busy ? '提交中…' : model.localOnly ? '保存' : '提交评审'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="确认项目信息变更"
        className="wb-ml-review max-h-[min(28rem,70vh)] overflow-auto scrollbar-sleek break-words"
        align="end"
      >
        <strong>本次修改</strong>
        <ul>
          {model.changes.map((field) => (
            <li key={field}>
              {CHARTER_LABELS[field]}：{(model.form!.value[field] ?? '').trim() || '留空'}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="wb-btn wb-btn-primary"
          disabled={disabled}
          onClick={() => {
            setOpen(false)
            void model.submit().then((ok) => {
              if (ok) {
                onSubmitted()
              }
            })
          }}
        >
          {model.localOnly ? '确认保存' : '确认提交'}
        </button>
      </PopoverContent>
    </Popover>
  )
}
