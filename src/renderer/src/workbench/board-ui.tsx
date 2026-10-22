import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

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

/**
 * G3 board action button: icon + short verb text (2026-10-22 真机反馈轮).
 * 对象级动作点不再用纯小图标——真机验证隐蔽;动词 + 宾语的通行写法,
 * AI 角色由图标与发送弹窗标题承载。
 */
export function BoardActionButton({
  children,
  className = '',
  ...props
}: {
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`g3-action-button ${className}`.trim()} {...props}>
      {children}
    </button>
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
