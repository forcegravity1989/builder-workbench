import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './board-ui.css'

/**
 * G3 board icon button: icon-only control with an accurate accessible name and
 * a short hover/focus tooltip on the Orca Radix primitive (Esc closes it
 * natively). The hand-rolled prototype tooltip is not carried over.
 */
export function BoardIconButton({
  label,
  className = '',
  children,
  ...props
}: {
  label: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={`g3-icon-button ${className}`.trim()}
        aria-label={label}
        {...props}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" showArrow={false}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Renders stored multi-line text one line per paragraph; empty shows a placeholder. */
export function BoardLines({ text, empty = '待明确' }: { text?: string; empty?: string }) {
  return (
    <div className="g3-lines">
      {(text || empty)
        .split('\n')
        .filter((line) => line.trim())
        .map((line, index) => (
          <p key={index}>{line}</p>
        ))}
    </div>
  )
}
