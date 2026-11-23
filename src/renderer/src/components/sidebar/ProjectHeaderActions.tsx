import React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Why: desktop hover actions should not permanently reserve project-title width;
// touch devices keep them in normal flow because there is no hover reveal.
// Why: title surface uses cursor-grab; force pointer here so … / + / chevron
// (and gaps) never show the reorder hand. self-stretch fills the row height in
// flow so the gutter beside buttons is still an action hit target, not a drag arm.
export const PROJECT_HEADER_ACTIONS_CLASS_NAME = cn(
  'flex shrink-0 cursor-pointer items-center gap-0.5 self-stretch',
  'can-hover:absolute can-hover:right-1 can-hover:top-1/2 can-hover:z-10 can-hover:-translate-y-1/2',
  'can-hover:rounded-md can-hover:bg-worktree-sidebar can-hover:pl-1',
  'can-hover:pointer-events-none can-hover:opacity-0 can-hover:transition-opacity',
  'group-hover:pointer-events-auto group-hover:opacity-100',
  'has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100',
  'has-[button[data-state=open]]:pointer-events-auto has-[button[data-state=open]]:opacity-100'
)

export const SIDEBAR_GROUP_CHEVRON_SLOT_CLASS =
  'flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground'

export const SIDEBAR_GROUP_FIXED_CHEVRON_CLASS = cn(
  SIDEBAR_GROUP_CHEVRON_SLOT_CLASS,
  'absolute top-1/2 right-1 -translate-y-1/2'
)

export function SidebarGroupChevron({ expanded }: { expanded: boolean }): React.JSX.Element {
  return (
    <ChevronDown
      aria-hidden
      className={cn('size-3.5 transition-transform', !expanded && '-rotate-90')}
    />
  )
}

export function ProjectHeaderActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      data-repo-header-actions=""
      className={cn(PROJECT_HEADER_ACTIONS_CLASS_NAME, className)}
      {...props}
    />
  )
}
