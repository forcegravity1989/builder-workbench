import { CircleCheck, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PrototypeReviewSubmit } from './use-prototype-review-annotations'

/** A reviewer's way to hand notes back to the document's owner, in place of sending to a model. */
export function PrototypeReviewSubmitButton({
  submit,
  className
}: {
  submit: PrototypeReviewSubmit
  className?: string
}): React.JSX.Element {
  const label = submit.submitted ? `已提交给 ${submit.hostName}` : `提交给 ${submit.hostName}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          className={`max-w-[10rem] gap-1.5 ${className ?? ''}`}
          disabled={submit.submitting || submit.submitted || submit.count === 0}
          onClick={submit.onSubmit}
        >
          {submit.submitting ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : submit.submitted ? (
            <CircleCheck className="size-3 shrink-0" />
          ) : (
            <Send className="size-3 shrink-0" />
          )}
          <span className="truncate">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        把这些批注交给 {submit.hostName}，并通知对方
      </TooltipContent>
    </Tooltip>
  )
}
