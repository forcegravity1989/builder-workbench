import type { ComponentType } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'

export function TaskPageSourceChip({
  id,
  label,
  Icon,
  active,
  disabled,
  onSelect
}: {
  id: string
  label: string
  Icon: ComponentType<{ className?: string }>
  active: boolean
  disabled?: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={onSelect}
          data-task-source={id}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'group flex h-8 w-8 items-center justify-center rounded-md border transition',
            active
              ? 'border-foreground/40 bg-muted/70 text-foreground shadow-sm'
              : 'border-border/40 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-55'
          )}
        >
          <Icon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
