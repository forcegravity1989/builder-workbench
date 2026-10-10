import { CodeHubFilterPopover } from './FilterPopover'
import { CodeHubCreateIssueDialog } from './CreateIssueDialog'
import { useEffect, useState } from 'react'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import TaskProjectSourceCombobox from '@/components/task-project-source-combobox'
import { normalizeTaskRepoSelection } from '@/components/task-page-default-repo-selection'
import { LoaderCircle, Plus, RefreshCw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { isCodeHubGitRemote } from '../../../../../shared/codehub'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

export function TaskPageCodeHubFilters({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element {
  const {
    codehubView,
    setCodehubView,
    codehubState,
    setCodehubState,
    codehubLoading,
    setCodehubRefreshNonce,
    codehubQuery,
    setCodehubQuery,
    codehubPreset,
    setCodehubPreset,
    codehubAuthor,
    setCodehubAuthor,
    codehubAssignee,
    setCodehubAssignee,
    selectedRepos,
    updateSettings,
    eligibleRepos,
    repoSelection,
    setRepoSelection,
    taskPickerGroups,
    taskPickerRepos,
    getTaskPickerRepoHostLabel
  } = model
  const [createOpen, setCreateOpen] = useState(false)
  const codehubRepos = selectedRepos.filter((repo) => isCodeHubGitRemote(repo.gitRemoteIdentity))
  const codehubRepo = codehubRepos[0]
  const [searchDraft, setSearchDraft] = useState(codehubQuery)
  useEffect(() => {
    setSearchDraft(codehubQuery)
  }, [codehubQuery])
  const workbench = isWorkbenchShell()
  const presets: readonly (readonly ['open' | 'mine' | 'review', string])[] =
    codehubView === 'mrs'
      ? ([
          ['open', translate('auto.components.TaskPage.606a85c774', 'Open')],
          ['mine', translate('auto.components.TaskPage.7698af5263', 'Mine')],
          ['review', translate('auto.components.TaskPage.524f095d55', 'Needs review')]
        ] as const)
      : ([
          ['open', translate('auto.components.TaskPage.606a85c774', 'Open')],
          ['mine', translate('auto.components.TaskPage.94f0339621', 'Assigned to me')]
        ] as const)
  const applyPreset = (preset: 'open' | 'mine' | 'review'): void => {
    setCodehubPreset(preset)
    setCodehubState('opened')
    setCodehubAuthor('')
    setCodehubAssignee('')
  }
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-md rounded-b-none border border-border/50 bg-muted/35 px-3 py-2.5">
      <div
        className={cn(
          'flex min-w-0',
          workbench ? 'flex-row flex-wrap items-center gap-x-3 gap-y-2' : 'flex-col gap-2.5'
        )}
      >
        <div className="flex shrink-0 items-center gap-1 text-xs">
          {(['issues', 'mrs'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => {
                setCodehubView(view)
                if (view === 'issues' && codehubPreset === 'review') {
                  setCodehubPreset('open')
                }
                if (view === 'issues' && codehubState === 'merged') {
                  setCodehubState('opened')
                }
              }}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition',
                codehubView === view
                  ? 'border-border/50 bg-foreground/90 text-background shadow-xs'
                  : 'border-border/60 bg-muted/50 text-foreground shadow-xs hover:bg-muted/70'
              )}
            >
              {view === 'issues'
                ? translate('auto.components.TaskPage.dfc0c79bd8', 'Issues')
                : translate('auto.components.TaskPage.137e2a8a01', 'PRs')}
            </button>
          ))}
        </div>
        <div className="min-w-0 max-w-[220px] shrink-0">
          <TaskProjectSourceCombobox
            groups={taskPickerGroups}
            selected={repoSelection}
            getRepoHostLabel={getTaskPickerRepoHostLabel}
            onChange={(next) => {
              const normalized = normalizeTaskRepoSelection(eligibleRepos, next)
              setRepoSelection(normalized)
              void updateSettings({ defaultRepoSelection: [...normalized] }).catch(() => {
                toast.error(
                  translate(
                    'auto.components.TaskPage.dfd72673e7',
                    'Failed to save project selection.'
                  )
                )
              })
            }}
            onSelectAll={() => {
              setRepoSelection(new Set(taskPickerRepos.map((repo) => repo.id)))
              void updateSettings({ defaultRepoSelection: null }).catch(() => {
                toast.error(
                  translate(
                    'auto.components.TaskPage.dfd72673e7',
                    'Failed to save project selection.'
                  )
                )
              })
            }}
            triggerClassName="h-8 w-auto max-w-[220px] rounded-md border border-border/50 bg-muted/50 px-2 text-xs font-medium shadow-sm transition hover:bg-muted/50 focus:ring-2 focus:ring-ring/20 focus:outline-none"
          />
        </div>
        {workbench ? <span className="h-4 w-px shrink-0 bg-border/80" aria-hidden /> : null}
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {presets.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition',
                codehubPreset === id &&
                  codehubState === 'opened' &&
                  !codehubAuthor &&
                  !codehubAssignee
                  ? 'border-border/50 bg-foreground/90 text-background shadow-xs'
                  : 'border-border/60 bg-background text-foreground shadow-xs hover:bg-muted/60'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {workbench ? <span className="h-4 w-px shrink-0 bg-border/80" aria-hidden /> : null}
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center gap-2',
            workbench && 'min-w-48 flex-1'
          )}
        >
          <CodeHubFilterPopover model={model} />
          <div className="relative min-w-0 flex-1 basis-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(event) => {
                const value = event.target.value
                setSearchDraft(value)
                if (codehubView !== 'mrs') {
                  setCodehubQuery(value)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  setCodehubQuery(searchDraft)
                }
              }}
              placeholder={
                codehubView === 'mrs'
                  ? translate('auto.components.TaskPage.codehubSearchMrs', 'Search CodeHub PRs')
                  : translate(
                      'auto.components.TaskPage.codehubSearchIssues',
                      'Search CodeHub issues'
                    )
              }
              className="h-8 rounded-md border-border/60 bg-background pl-8 pr-8 text-xs text-foreground shadow-xs"
            />
            {searchDraft ? (
              <button
                type="button"
                aria-label={translate('auto.components.TaskPage.b797bdd7c3', 'Clear search')}
                onClick={() => {
                  setSearchDraft('')
                  setCodehubQuery('')
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {codehubView === 'issues' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={!codehubRepo}
                    aria-label={translate(
                      'auto.components.TaskPage.codehubCreateIssue',
                      'Create issue'
                    )}
                    className="size-8 border-border/60 bg-background text-foreground shadow-xs hover:bg-muted/60"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {translate('auto.components.TaskPage.codehubCreateIssue', 'Create issue')}
                </TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={codehubLoading}
                  aria-label={translate(
                    'auto.components.TaskPage.codehubRefresh',
                    'Refresh CodeHub'
                  )}
                  className="size-8 border-border/60 bg-background text-foreground shadow-xs hover:bg-muted/60"
                  onClick={() => setCodehubRefreshNonce((nonce) => nonce + 1)}
                >
                  {codehubLoading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {translate('auto.components.TaskPage.codehubRefresh', 'Refresh CodeHub')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
      <CodeHubCreateIssueDialog
        repo={codehubRepo}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setCodehubRefreshNonce((nonce) => nonce + 1)}
      />
    </div>
  )
}
