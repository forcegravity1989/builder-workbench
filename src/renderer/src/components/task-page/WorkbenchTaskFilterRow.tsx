import { WorkbenchTaskHelp } from '@/workbench/WorkbenchScreenGuide'

export function WorkbenchTaskFilterRow({
  children,
  helpEnabled
}: {
  children: React.ReactNode
  helpEnabled: boolean
}): React.JSX.Element {
  return (
    <div
      className="flex min-w-0 items-start gap-2"
      data-contextual-tour-target="tasks-source-filters"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <WorkbenchTaskHelp enabled={helpEnabled} />
    </div>
  )
}
