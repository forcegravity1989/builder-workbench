import { cn } from '@/lib/utils'

// Why: the setup-guide presentation variant left this fork with the setup guide
// itself; every integration card now renders in the settings-page shape.
export function useIntegrationCardShellClass(className?: string): string {
  return cn('rounded-xl border border-border bg-card px-4 py-3.5 shadow-xs', className)
}

export function IntegrationCardGroup(props: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <div className={cn('space-y-3', props.className)}>{props.children}</div>
}

export function useIntegrationSubordinateRowClass(className?: string): string {
  return cn('rounded-md border border-border/50 bg-muted/50 px-3 py-2', className)
}

export function useIntegrationCommandRowClass(): string {
  return 'flex items-center gap-2 font-mono text-xs rounded-md border border-border/50 bg-muted/50 px-3 py-2'
}
