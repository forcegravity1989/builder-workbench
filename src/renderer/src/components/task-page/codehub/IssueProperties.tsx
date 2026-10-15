import { CodeHubIssueStatusMenu } from './IssueStatusMenu'
import { translate } from '@/i18n/i18n'
import { FolderKanban } from 'lucide-react'

export function CodeHubIssueProperties({
  closed,
  stateBusy,
  setIssueState,
  assignees,
  labels,
  workspaceLabel
}: {
  closed: boolean
  stateBusy: boolean
  setIssueState: (
    state: 'open' | 'closed',
    stateReason?: 'completed' | 'not_planned' | 'duplicate',
    duplicateOf?: number
  ) => void
  assignees: string[]
  labels: string[]
  workspaceLabel: string | null
}): React.JSX.Element {
  return (
    <aside className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-border/60 px-6 py-5 text-[13px] sm:grid-cols-4">
      <section className="min-w-0">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.GitHubItemDialog.00ccdf9b5a', 'Status')}
        </div>
        <CodeHubIssueStatusMenu closed={closed} busy={stateBusy} onSetState={setIssueState} />
      </section>
      <section className="min-w-0">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.TaskPage.8aba10579d', 'Assignees')}
        </div>
        <div className="text-[12px] text-muted-foreground">
          {assignees.length > 0
            ? assignees.join(', ')
            : translate('auto.components.GitHubItemDialog.886a64b081', 'None yet')}
        </div>
      </section>
      <section className="min-w-0">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.GitHubItemDialog.217e55d87c', 'Labels')}
        </div>
        {labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-border/40 bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground">
            {translate('auto.components.GitHubItemDialog.886a64b081', 'None yet')}
          </div>
        )}
      </section>
      <section className="min-w-0">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.GitHubItemDialog.2e4d806c92', 'Workspace')}
        </div>
        {workspaceLabel ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <FolderKanban className="size-3.5 shrink-0" />
            <span className="truncate">{workspaceLabel}</span>
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground">
            {translate('auto.components.GitHubItemDialog.886a64b081', 'None yet')}
          </div>
        )}
      </section>
    </aside>
  )
}
