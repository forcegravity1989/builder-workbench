import { useState } from 'react'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import TaskProjectSourceCombobox from '@/components/task-project-source-combobox'
import { normalizeTaskRepoSelection } from '@/components/task-page-default-repo-selection'
import { ChevronRight, ExternalLink, ListFilter, LoaderCircle, Plus, RefreshCw, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const codehubRepos = selectedRepos.filter((repo) => isCodeHubGitRemote(repo.gitRemoteIdentity))
  const codehubRepo = codehubRepos[0]
  const projectUrl =
    codehubRepos.length === 1 ? (codehubRepos[0]?.gitRemoteIdentity?.remoteUrl ?? null) : null
  const workbench = isWorkbenchShell()
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterSection, setFilterSection] = useState<'status' | 'author' | 'assignee' | null>(null)
  const presets =
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
  const states =
    codehubView === 'mrs'
      ? (['opened', 'merged', 'closed', 'all'] as const)
      : (['opened', 'closed', 'all'] as const)
  const applyPreset = (preset: 'open' | 'mine' | 'review'): void => {
    setCodehubPreset(preset)
    setCodehubState('opened')
    setCodehubAuthor('')
    setCodehubAssignee('')
  }
  const filterCount = (codehubState !== 'opened' ? 1 : 0) + (codehubAuthor ? 1 : 0) + (codehubAssignee ? 1 : 0)
  return (
    <div
      className="flex min-w-0 flex-col gap-2.5 rounded-md rounded-b-none border border-border/50 bg-muted/35 px-3 py-2.5"
      data-contextual-tour-target="tasks-search-presets"
    >
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
                  translate('auto.components.TaskPage.dfd72673e7', 'Failed to save project selection.')
                )
              })
            }}
            onSelectAll={() => {
              setRepoSelection(new Set(taskPickerRepos.map((repo) => repo.id)))
              void updateSettings({ defaultRepoSelection: null }).catch(() => {
                toast.error(
                  translate('auto.components.TaskPage.dfd72673e7', 'Failed to save project selection.')
                )
              })
            }}
            triggerClassName="h-8 w-auto max-w-[220px] rounded-md border border-border/50 bg-muted/50 px-2 text-xs font-medium shadow-sm transition hover:bg-muted/50 focus:ring-2 focus:ring-ring/20 focus:outline-none"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!projectUrl}
              aria-label={translate('auto.components.TaskPage.codehubOpenProject', 'Open project in CodeHub')}
              className="size-8 rounded-md border-border/50 bg-muted/50 text-foreground shadow-sm hover:bg-muted/50"
              onClick={() => {
                if (projectUrl) {
                  void window.api.shell.openUrl(projectUrl)
                }
              }}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.TaskPage.codehubOpenProject', 'Open project in CodeHub')}
          </TooltipContent>
        </Tooltip>
        {workbench ? <span className="h-4 w-px shrink-0 bg-border/80" aria-hidden /> : null}
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {presets.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition',
                codehubPreset === id && codehubState === 'opened' && !codehubAuthor && !codehubAssignee
                  ? 'border-border/50 bg-foreground/90 text-background shadow-xs'
                  : 'border-border/60 bg-background text-foreground shadow-xs hover:bg-muted/60'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {workbench ? <span className="h-4 w-px shrink-0 bg-border/80" aria-hidden /> : null}
        <div className={cn('flex min-w-0 flex-wrap items-center gap-2', workbench && 'min-w-48 flex-1')}>
          <Popover
            open={filterOpen}
            onOpenChange={(open) => {
              setFilterOpen(open)
              if (!open) {
                setFilterSection(null)
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-md border-border/60 bg-background px-2.5 text-xs font-medium text-foreground shadow-xs hover:bg-muted/60"
              >
                <ListFilter className="size-3.5" />
                {translate('auto.components.github.PRFilterDropdowns.79c54552f7', 'Filters')}
                {filterCount > 0 ? (
                  <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[10px] font-medium text-foreground">
                    {filterCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              {filterSection === null ? (
                <div className="py-1 text-xs">
                  {(
                    [
                      ['status', translate('auto.components.github.PRFilterSections.764a0b4ce1', 'Status'), codehubState],
                      ['author', translate('auto.components.github.PRFilterSections.24754c44ad', 'Author'), codehubAuthor],
                      ['assignee', translate('auto.components.github.PRFilterSections.ea3416d646', 'Assignee'), codehubAssignee]
                    ] as const
                  ).map(([key, label, value]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilterSection(key)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-muted/50"
                    >
                      <span>{label}</span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {value ? <span className="max-w-[140px] truncate">{value}</span> : null}
                        <ChevronRight className="size-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              ) : filterSection === 'status' ? (
                <div className="flex flex-col py-1 text-xs">
                  {states.map((state) => (
                    <button
                      key={state}
                      type="button"
                      className="px-3 py-1.5 text-left hover:bg-muted/50"
                      onClick={() => {
                        setCodehubState(state)
                        setCodehubPreset('open')
                        setFilterOpen(false)
                        setFilterSection(null)
                      }}
                    >
                      {state === 'opened'
                        ? translate('auto.components.TaskPage.606a85c774', 'Open')
                        : state === 'merged'
                          ? translate('auto.components.TaskPage.37a82eaaf8', 'Merged')
                          : state === 'closed'
                            ? translate('auto.components.TaskPage.d09bf34db7', 'Closed')
                            : translate('auto.components.github.PRFilterSections.2b2f019091', 'Any state')}
                    </button>
                  ))}
                </div>
              ) : (
                <form
                  className="flex flex-col gap-2 p-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setFilterOpen(false)
                    setFilterSection(null)
                  }}
                >
                  <Input
                    autoFocus
                    value={filterSection === 'author' ? codehubAuthor : codehubAssignee}
                    onChange={(event) => {
                      if (filterSection === 'author') {
                        setCodehubAuthor(event.target.value)
                      } else {
                        setCodehubAssignee(event.target.value)
                      }
                    }}
                    placeholder={
                      filterSection === 'author'
                        ? translate('auto.components.github.PRFilterSections.24754c44ad', 'Author')
                        : translate('auto.components.github.PRFilterSections.ea3416d646', 'Assignee')
                    }
                  />
                </form>
              )}
            </PopoverContent>
          </Popover>
          <div className="relative min-w-0 flex-1 basis-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={codehubQuery}
              onChange={(event) => setCodehubQuery(event.target.value)}
              placeholder={
                codehubView === 'mrs'
                  ? translate('auto.components.TaskPage.eee4df4c66', 'Search GitHub PRs...')
                  : translate('auto.components.TaskPage.b15ceb409d', 'Search GitHub issues...')
              }
              className="h-8 rounded-md border-border/60 bg-background pl-8 pr-8 text-xs text-foreground shadow-xs"
            />
            {codehubQuery ? (
              <button
                type="button"
                aria-label={translate('auto.components.TaskPage.b797bdd7c3', 'Clear search')}
                onClick={() => setCodehubQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2" data-contextual-tour-target="tasks-actions">
          {codehubView === 'issues' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!codehubRepo}
                  aria-label={translate('auto.components.TaskPage.codehubCreateIssue', 'Create issue')}
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
                aria-label={translate('auto.components.TaskPage.codehubRefresh', 'Refresh CodeHub')}
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
      <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {translate('auto.components.TaskPage.codehubCreateIssue', 'Create issue')}
            </DialogTitle>
            <DialogDescription>{codehubRepo?.displayName}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const nextTitle = title.trim()
              if (!codehubRepo || !nextTitle || creating) {
                return
              }
              setCreating(true)
              void window.api.codehub
                .createIssue({
                  repoPath: codehubRepo.path,
                  repoId: codehubRepo.id,
                  title: nextTitle,
                  description: description.trim() || undefined,
                  assignee: assignee.trim() || undefined
                })
                .then(() => {
                  setTitle('')
                  setDescription('')
                  setAssignee('')
                  setCreateOpen(false)
                  toast.success(
                    translate('auto.components.TaskPage.codehubIssueCreated', 'Issue created')
                  )
                  setCodehubRefreshNonce((nonce) => nonce + 1)
                })
                .catch((error: unknown) => {
                  toast.error(error instanceof Error ? error.message : String(error))
                })
                .finally(() => setCreating(false))
            }}
          >
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={translate('auto.components.TaskPage.codehubIssueTitle', 'New issue title')}
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={translate('auto.components.TaskPage.codehubIssueBody', 'Description')}
              className="min-h-28 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
            />
            <Input
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              placeholder={translate('auto.components.TaskPage.codehubAssignee', 'Assignee username')}
            />
            <DialogFooter>
              <Button type="submit" disabled={creating || title.trim().length === 0}>
                {creating ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {translate('auto.components.TaskPage.codehubCreateIssue', 'Create issue')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
