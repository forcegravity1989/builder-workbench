import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SidebarGroupChevron } from '@/components/sidebar/ProjectHeaderActions'

/**
 * Workbench section header matching the native worktree section chrome.
 *
 * Why: 已固定/版本/工作区 must read as one consistent accordion. The guide
 * chevron ( › / ▾ ) sits right after the title — it only cues "this expands",
 * clicking the whole row toggles, and section actions stay pinned to the right.
 */
export function WorkbenchSidebarSectionHeader({
  icon: Icon,
  children,
  action,
  collapsed = false,
  onToggle
}: {
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  action?: ReactNode
  collapsed?: boolean
  onToggle?: () => void
}) {
  const interactive = typeof onToggle === 'function'
  return (
    <div
      className={cn(
        'flex h-7 items-center gap-1.5 pl-[10px] pr-2 text-[13px] font-semibold leading-none text-foreground',
        interactive && 'cursor-pointer select-none'
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? !collapsed : undefined}
      onClick={interactive ? onToggle : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              // Why target check: action buttons (帮助/新建) live inside this row;
              // their Enter/Space must activate the button, not bubble up and
              // collapse the section. Only the header surface itself toggles.
              if (event.target !== event.currentTarget) {
                return
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onToggle?.()
              }
            }
          : undefined
      }
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-3" />
      </span>
      <span className="min-w-0 shrink-0 truncate">{children}</span>
      <span className="flex shrink-0 items-center text-muted-foreground/60" aria-hidden>
        <SidebarGroupChevron expanded={!collapsed} />
      </span>
      <span className="min-w-0 flex-1" />
      {action ? (
        <span
          className="flex shrink-0 items-center gap-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {action}
        </span>
      ) : null}
    </div>
  )
}
