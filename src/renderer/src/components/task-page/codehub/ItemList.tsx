import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { CodeHubIssueListStatus } from './IssueStatusMenu'
import { TaskPageGitHubWorkItemStateBadge } from '@/components/task-page-github-work-item-status-badge'
import {
  getTaskPageGitHubPRIconTone,
  type GitHubWorkItemStatusItem
} from '@/components/task-page-github-work-item-status'
import type { CodeHubTaskItem } from '../../../../../shared/codehub-tasks'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ArrowRight,
  ChevronDown,
  CircleDot,
  EllipsisVertical,
  ExternalLink,
  GitPullRequest
} from 'lucide-react'
import {
  formatRelativeTime,
  GITHUB_PR_TASK_GRID_CLASS,
  GITHUB_TASK_GRID_CLASS,
  GITHUB_TASK_HEADER_SURFACE_CLASS,
  GITHUB_TASK_STICKY_ID_CELL_CLASS,
  GITHUB_TASK_STICKY_ID_HEADER_CLASS,
  GITHUB_TASK_STICKY_TITLE_CELL_CLASS,
  GITHUB_TASK_STICKY_TITLE_HEADER_CLASS,
  getTaskPageRepoSourceContext
} from '../../task-page-source-context'
import { CodeHubListResultNotice, TaskPageScopeFooter } from '@/workbench/TaskScopePanel'
import { resolveTaskRowWorkspace } from '@/workbench/scoped-task-workspace'
import { CodeHubAssigneesCell } from './AssigneesCell'
import { CodeHubLabelsCell } from './LabelsCell'

function githubStateOf(item: CodeHubTaskItem): GitHubWorkItemStatusItem {
  return {
    type: item.type === 'mr' ? 'pr' : 'issue',
    state: item.state === 'opened' ? 'open' : item.state
  }
}

export function TaskPageCodeHubItemList({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element {
  const {
    codehubItems,
    codehubLoading,
    codehubError,
    codehubView,
    codehubQuery,
    codehubAuthor,
    codehubAssignee,
    selectedRepos,
    setCodehubDetailItem,
    handleUseCodeHubItem,
    setCodehubRefreshNonce,
    repoMap,
    allWorktrees
  } = model
  const mrView = codehubView === 'mrs'
  const gridClass = mrView ? GITHUB_PR_TASK_GRID_CLASS : GITHUB_TASK_GRID_CLASS
  const query = codehubQuery.trim().toLowerCase()
  const authorFilter =
    codehubView === 'issues' && !model.workbenchScopeActive
      ? codehubAuthor.trim().toLowerCase()
      : ''
  const assigneeFilter =
    codehubView === 'issues' && !model.workbenchScopeActive
      ? codehubAssignee.trim().toLowerCase()
      : ''
  const labelFilters =
    codehubView === 'issues' && !model.workbenchScopeActive
      ? model.codehubLabels.map((label) => label.toLowerCase())
      : []
  const visibleItems = codehubItems.filter((item) => {
    if (item.type !== (mrView ? 'mr' : 'issue')) {
      return false
    }
    if (
      model.workbenchScopeActive &&
      (mrView || !model.workbenchScopeCodeHubItemKeys.has(`${item.repoId}:${item.iid}`))
    ) {
      return false
    }
    if (
      !mrView &&
      query &&
      !`${item.iid} ${item.title} ${item.author ?? ''} ${(item.labels ?? []).join(' ')}`
        .toLowerCase()
        .includes(query)
    ) {
      return false
    }
    if (authorFilter && (item.author ?? '').toLowerCase() !== authorFilter) {
      return false
    }
    if (assigneeFilter && !item.assignees.some((name) => name.toLowerCase() === assigneeFilter)) {
      return false
    }
    if (
      labelFilters.length > 0 &&
      !labelFilters.every((filter) =>
        (item.labels ?? []).some((label) => label.toLowerCase() === filter)
      )
    ) {
      return false
    }
    return true
  })
  return (
    <div className="flex min-h-0 min-w-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
      <div className="min-h-0 flex-initial overflow-auto scrollbar-sleek scrollbar-sleek-lg">
        <div
          className={cn(
            'sticky top-0 z-40 grid h-8 gap-3 border-b border-border/50 px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground [&>span]:flex [&>span]:items-center',
            GITHUB_TASK_HEADER_SURFACE_CLASS,
            gridClass
          )}
        >
          <span className={GITHUB_TASK_STICKY_ID_HEADER_CLASS}>
            {translate('auto.components.TaskPage.eb10c32872', 'ID')}
          </span>
          <span className={GITHUB_TASK_STICKY_TITLE_HEADER_CLASS}>
            {translate('auto.components.TaskPage.5eccb3c841', 'Title / Context')}
          </span>
          {mrView ? (
            <>
              <span>{translate('auto.components.TaskPage.f6fa3c97d0', 'Reviewers')}</span>
              <span>{translate('auto.components.TaskPage.a7396b05c6', 'Checks')}</span>
              <span>{translate('auto.components.TaskPage.443f7dd928', 'Merge')}</span>
            </>
          ) : (
            <>
              <span>{translate('auto.components.TaskPage.8aba10579d', 'Assignees')}</span>
              <span>{translate('auto.components.GitHubItemDialog.217e55d87c', 'Labels')}</span>
              <span>{translate('auto.components.TaskPage.154b0fa623', 'Status')}</span>
            </>
          )}
          <span>{translate('auto.components.TaskPage.f362667d55', 'Updated')}</span>
          <span />
        </div>
        {codehubError ? (
          <div className="border-b border-border px-4 py-4 text-sm text-destructive">
            {codehubError}
          </div>
        ) : null}
        {codehubLoading && visibleItems.length === 0 ? (
          <div>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className={cn('grid min-h-12 gap-3 px-3 py-2.5', gridClass)}>
                <div className="h-4 w-10 animate-pulse rounded bg-muted/70" />
                <div className="h-4 w-3/5 animate-pulse rounded bg-muted/70" />
                <div className="h-3 w-12 animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-12 animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-12 animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-12 animate-pulse rounded bg-muted/60" />
                <div />
              </div>
            ))}
          </div>
        ) : null}
        {!codehubLoading &&
        visibleItems.length === 0 &&
        !model.codehubHasMore &&
        !codehubError &&
        !model.workbenchScopeActive ? (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-medium text-foreground">
              {mrView
                ? translate('auto.components.TaskPage.codehubEmptyMrs', 'No CodeHub merge requests')
                : translate('auto.components.TaskPage.codehubEmptyIssues', 'No CodeHub issues')}
            </p>
          </div>
        ) : null}
        {visibleItems.map((item) => {
          const key = `${item.repoId ?? ''}:${item.type}:${item.iid}`
          const repo = selectedRepos.find((candidate) => candidate.id === item.repoId)
          // G2 (BW)：范围视图的 Issue 按明确绑定解析 Open/Start；无范围保持原 Start。
          const rowWorkspace = resolveTaskRowWorkspace({
            scope: model.workbenchScope,
            worktrees: allWorktrees,
            provider: 'codehub',
            item: { repoId: item.repoId, type: item.type, number: item.iid },
            sourceContext: getTaskPageRepoSourceContext(
              repoMap.get(item.repoId ?? '') ?? null,
              'codehub'
            )
          })
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => setCodehubDetailItem(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setCodehubDetailItem(item)
                }
              }}
              className={cn(
                'group/github-task-row grid min-h-12 cursor-pointer gap-3 border-b border-border/40 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                gridClass
              )}
            >
              <div className={GITHUB_TASK_STICKY_ID_CELL_CLASS}>
                <span className="inline-flex items-center gap-1 rounded-md border border-border/40 px-1.5 py-0.5 text-muted-foreground">
                  {item.type === 'mr' ? (
                    <GitPullRequest
                      className={cn('size-3', getTaskPageGitHubPRIconTone(githubStateOf(item)))}
                      aria-hidden
                    />
                  ) : (
                    <CircleDot className="size-3" aria-hidden />
                  )}
                  <span className="font-mono text-[11px] font-normal">#{item.iid}</span>
                </span>
              </div>
              <div className={GITHUB_TASK_STICKY_TITLE_CELL_CLASS}>
                <h3 className="truncate text-[13px] font-medium text-foreground">{item.title}</h3>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                  <span className="truncate">
                    {item.author ??
                      translate('auto.components.TaskPage.6430594b18', 'unknown author')}
                    {repo ? ` · ${repo.displayName}` : ''}
                  </span>
                  {item.type === 'mr' && item.sourceBranch && item.targetBranch ? (
                    <span className="truncate font-mono text-[11px]">
                      {item.sourceBranch} → {item.targetBranch}
                    </span>
                  ) : null}
                </div>
              </div>
              {mrView ? (
                <>
                  <span className="flex min-w-0 items-center truncate text-[12px] text-muted-foreground">
                    {item.reviewers.join(', ') || '—'}
                  </span>
                  <span className="flex items-center text-[12px] text-muted-foreground">—</span>
                  <span className="flex items-center">
                    <TaskPageGitHubWorkItemStateBadge item={githubStateOf(item)} />
                  </span>
                </>
              ) : (
                <>
                  <span className="flex min-w-0 items-center">
                    <CodeHubAssigneesCell
                      item={item}
                      onChanged={() => setCodehubRefreshNonce((nonce) => nonce + 1)}
                    />
                  </span>
                  <span className="flex min-w-0 items-center">
                    <CodeHubLabelsCell
                      item={item}
                      onChanged={() => setCodehubRefreshNonce((nonce) => nonce + 1)}
                    />
                  </span>
                  <span className="flex items-center">
                    <CodeHubIssueListStatus
                      item={item}
                      onChanged={() => setCodehubRefreshNonce((nonce) => nonce + 1)}
                    />
                  </span>
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center text-[11px] text-muted-foreground">
                    {item.updatedAt ? formatRelativeTime(item.updatedAt) : ''}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}
                </TooltipContent>
              </Tooltip>
              <div className="flex items-center justify-start gap-1 lg:justify-end">
                {item.type === 'mr' ? (
                  <DropdownMenu modal={false}>
                    <ButtonGroup>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        data-contextual-tour-target="tasks-start-workspace"
                        className="min-w-[72px] gap-1 bg-background/80 font-semibold"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleUseCodeHubItem(item)
                        }}
                      >
                        {translate('auto.components.TaskPage.7d08e8be0f', 'Start')}
                        <ArrowRight className="size-3" />
                      </Button>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          onClick={(event) => event.stopPropagation()}
                          className="bg-background/80"
                          aria-label={translate(
                            'auto.components.TaskPage.7deb9e59a5',
                            'More PR actions'
                          )}
                        >
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                    </ButtonGroup>
                    <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenuItem onSelect={() => window.api.shell.openUrl(item.url)}>
                        <ExternalLink className="size-4" />
                        {translate('auto.components.TaskPage.c1d1600362', 'Open in browser')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant={rowWorkspace.hasWorkspace ? 'default' : 'outline'}
                      size="xs"
                      data-contextual-tour-target="tasks-start-workspace"
                      className={cn(
                        'min-w-[72px] gap-1 font-semibold',
                        rowWorkspace.hasWorkspace ? 'shadow-xs' : 'bg-background/80'
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleUseCodeHubItem(item)
                      }}
                    >
                      {rowWorkspace.hasWorkspace
                        ? translate('auto.components.TaskPage.606a85c774', 'Open')
                        : translate('auto.components.TaskPage.7d08e8be0f', 'Start')}
                      <ArrowRight className="size-3" />
                    </Button>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          onClick={(event) => event.stopPropagation()}
                          className="bg-background/80"
                          aria-label={translate(
                            'auto.components.TaskPage.66ae7330f6',
                            'More actions'
                          )}
                        >
                          <EllipsisVertical className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenuItem onSelect={() => window.api.shell.openUrl(item.url)}>
                          <ExternalLink className="size-4" />
                          {translate('auto.components.TaskPage.c1d1600362', 'Open in browser')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </div>
          )
        })}
        <TaskPageScopeFooter
          model={model}
          extraLoading={codehubLoading}
          filteredCount={visibleItems.length}
        />
        <CodeHubListResultNotice
          hasMore={!codehubLoading && !model.workbenchScopeActive && model.codehubHasMore}
        />
      </div>
    </div>
  )
}
