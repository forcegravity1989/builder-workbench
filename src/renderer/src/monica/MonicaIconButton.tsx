import type { ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function MonicaIconButton({
  label,
  icon: Icon,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          {...props}
          type="button"
          className={`monica-btn monica-btn-ghost monica-icon-button ${className}`}
          aria-label={label}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
