import { useState } from 'react'
import { CodeHubIssueStatusMenu } from './IssueStatusMenu'
import { translate } from '@/i18n/i18n'
import { FolderKanban, LoaderCircle, Pencil, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

export function CodeHubIssueProperties({
  closed,
  stateBusy,
  setIssueState,
  assignees,
  labels,
  editingLabels,
  setEditingLabels,
  labelDraft,
  setLabelDraft,
  savingLabels,
  saveLabels,
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
  editingLabels: boolean
  setEditingLabels: (editing: boolean) => void
  labelDraft: string[]
  setLabelDraft: (labels: string[]) => void
  savingLabels: boolean
  saveLabels: () => void
  workspaceLabel: string | null
}): React.JSX.Element {
  const [labelInput, setLabelInput] = useState('')
  // The CLI takes labels as a CSV with no label-list command, so names are
  // typed free-text; comma and Enter both finish an entry.
  const commitLabelInput = (): void => {
    const parts = labelInput
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length === 0) {
      return
    }
    setLabelDraft([...new Set([...labelDraft, ...parts])])
    setLabelInput('')
  }
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
        <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.GitHubItemDialog.217e55d87c', 'Labels')}
          <Popover
            open={editingLabels}
            onOpenChange={(open) => {
              if (open) {
                setLabelDraft(labels)
                setLabelInput('')
              }
              setEditingLabels(open)
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={translate('auto.components.TaskPage.codehubEditLabels', 'Edit labels')}
                className="rounded p-0.5 text-muted-foreground/70 hover:text-foreground"
              >
                <Pencil className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
              <div className="space-y-2">
                <div className="flex min-h-6 flex-wrap gap-1">
                  {labelDraft.length > 0 ? (
                    labelDraft.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-0.5 rounded-full border border-border/40 bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground"
                      >
                        {label}
                        <button
                          type="button"
                          aria-label={translate(
                            'auto.components.TaskPage.codehubRemoveLabel',
                            'Remove label'
                          )}
                          onClick={() => setLabelDraft(labelDraft.filter((name) => name !== label))}
                          className="text-muted-foreground/60 hover:text-foreground"
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      {translate('auto.components.GitHubItemDialog.886a64b081', 'None yet')}
                    </div>
                  )}
                </div>
                <input
                  value={labelInput}
                  onChange={(event) => setLabelInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault()
                      commitLabelInput()
                    }
                  }}
                  placeholder={translate('auto.components.TaskPage.codehubAddLabel', 'Add label…')}
                  className="h-7 w-full rounded-md border border-border/60 bg-background px-2 text-[12px] outline-none focus-visible:border-primary"
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingLabels(false)}
                  >
                    {translate('auto.components.TaskPage.codehubCancelLabels', 'Cancel')}
                  </Button>
                  <Button type="button" size="sm" onClick={saveLabels} disabled={savingLabels}>
                    {savingLabels ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                    {translate('auto.components.TaskPage.codehubSaveLabels', 'Save')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
