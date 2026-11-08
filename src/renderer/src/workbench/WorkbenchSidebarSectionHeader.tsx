import type { ComponentType, ReactNode } from 'react'

/** Match the native worktree section header's height, type and leading inset. */
export function WorkbenchSidebarSectionHeader({
  icon: Icon,
  children,
  action
}: {
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex h-7 items-center gap-1.5 pl-[10px] pr-2 text-[13px] font-semibold leading-none text-muted-foreground">
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-3" />
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {action}
    </div>
  )
}
