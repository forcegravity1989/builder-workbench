import { useEffect, useMemo, useState } from 'react'
import { GitPullRequest, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/keyboard/app-keyboard-router'
import { hasVisibleOverlay } from '@/lib/overlay-interaction/visible-overlay'
import {
  matchScopedTaskWorkspaces,
  notifyScopedWorkspaceUnavailable,
  resolveScopedComposerAdditions
} from '@/workbench/scoped-task-workspace'
import { TaskPageScopeHeader } from '@/workbench/TaskScopePanel'
import { dispatchScopedWorktrees } from '@/workbench/version-workspace-choice-state'
import { isCodeHubGitRemote } from '../../../../../shared/codehub'
import type { CodeHubListTasksArgs } from '../../../../../shared/codehub-api'
import {
  getExecutionHostLabel,
  getRepoExecutionHostId,
  parseExecutionHostId
} from '../../../../../shared/execution-host/execution-host'
import { getLinkedWorkItemSuggestedName } from '../../../../../shared/workspace/naming/workspace-name'
import { getTaskProjectPickerGroups } from '../../../../../shared/work-items/task-repo-selection'
import { TaskPageSourceChip } from '../TaskPageSourceChip'
import { useTaskPageRepoSelection } from '../use-task-page-repo-selection'
import { useTaskPageStoreBindings } from '../use-task-page-store-bindings'
import { useTaskPageCodeHubLoading, type CodeHubTaskRow } from '../../use-task-page-codehub-loading'
import { TaskPageCodeHubDetail } from './Detail'
import { TaskPageCodeHubFilters } from './Filters'
import { TaskPageCodeHubItemList } from './ItemList'
import { useCodeHubDetailItem } from './use-codehub-detail-item'

export function CodeHubTaskPage(): React.JSX.Element {
  const t = useTranslate()
  const selection = useTaskPageRepoSelection(useTaskPageStoreBindings())
  const { pageData, closeTaskPage, openTaskPage, updateSettings } = selection
  const scope = pageData.workbenchTaskScope ?? null
  const eligibleRepos = useMemo(
    () => selection.eligibleRepos.filter((repo) => isCodeHubGitRemote(repo.gitRemoteIdentity)),
    [selection.eligibleRepos]
  )
  const selectedRepos = useMemo(
    () => eligibleRepos.filter((repo) => selection.repoSelection.has(repo.id)),
    [eligibleRepos, selection.repoSelection]
  )
  const taskPickerGroups = useMemo(
    () => getTaskProjectPickerGroups(eligibleRepos, selection.repoSelection),
    [eligibleRepos, selection.repoSelection]
  )
  const taskPickerRepos = useMemo(
    () => taskPickerGroups.map((group) => group.repo),
    [taskPickerGroups]
  )
  const detail = useCodeHubDetailItem({ ...selection, selectedRepos })
  const [codehubView, setCodehubView] = useState<'issues' | 'mrs'>('issues')
  const [codehubState, setCodehubState] =
    useState<NonNullable<CodeHubListTasksArgs['state']>>('opened')
  const [codehubPreset, setCodehubPreset] = useState<'open' | 'mine' | 'review'>('open')
  const [codehubQuery, setCodehubQuery] = useState('')
  const [codehubAuthor, setCodehubAuthor] = useState('')
  const [codehubAssignee, setCodehubAssignee] = useState('')
  const [codehubLabels, setCodehubLabels] = useState<string[]>([])
  const [codehubRefreshNonce, setCodehubRefreshNonce] = useState(0)
  const [codehubItems, setCodehubItems] = useState<CodeHubTaskRow[]>([])
  const [codehubLoading, setCodehubLoading] = useState(false)
  const [codehubError, setCodehubError] = useState<string | null>(null)
  const scopeEntryKey = scope
    ? JSON.stringify([scope.version, scope.goalId, pageData.preselectedRepoId])
    : ''
  useEffect(() => {
    if (!scope?.goalId) {
      return
    }
    selection.setRepoSelection(selection.resolvedInitialSelection)
    setCodehubView('issues')
    setCodehubState('all')
    setCodehubPreset('open')
    setCodehubQuery('')
    setCodehubAuthor('')
    setCodehubAssignee('')
    setCodehubLabels([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeEntryKey])
  const { codehubHasMore, codehubScopeMissing, codehubScopeReadyCount } = useTaskPageCodeHubLoading(
    {
      selectedRepos,
      taskSource: detail.codehubDetailItem ? 'codehub-detail' : 'codehub',
      codehubView,
      codehubState,
      codehubPreset,
      codehubQuery,
      codehubAuthor,
      codehubAssignee,
      codehubLabels,
      codehubRefreshNonce,
      setCodehubItems,
      setCodehubLoading,
      setCodehubError,
      pageData,
      scopeRepoId: pageData.preselectedRepoId
    }
  )

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented || selection.activeModal !== 'none') {
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement) || hasVisibleOverlay()) {
        return
      }
      const textEntry =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      if (textEntry) {
        if (!detail.codehubDetailItem) {
          event.preventDefault()
          target.blur()
        }
        return
      }
      event.preventDefault()
      if (detail.codehubDetailItem) {
        detail.setCodehubDetailItem(null)
      } else {
        closeTaskPage()
      }
    }
    addAppKeyListener('keydown', closeOnEscape)
    return () => removeAppKeyListener('keydown', closeOnEscape)
  }, [closeTaskPage, detail.codehubDetailItem, detail.setCodehubDetailItem, selection.activeModal])

  function clearWorkbenchProject(): void {
    useAppStore.setState((state) => ({
      taskPageData: { ...state.taskPageData, workbenchTaskScope: null }
    }))
  }

  function clearWorkbenchGoal(): void {
    if (!scope) {
      return
    }
    useAppStore.setState((state) => ({
      taskPageData: {
        ...state.taskPageData,
        workbenchTaskScope: { ...scope, goalId: null, goalLabel: null }
      }
    }))
  }

  function handleUseCodeHubItem(item: CodeHubTaskRow): void {
    if (!item.repoId) {
      return
    }
    const sourceContext = item.sourceContext ?? pageData.openCodeHubSourceContext ?? null
    if (scope && item.type === 'issue') {
      const scoped = matchScopedTaskWorkspaces({
        scope,
        worktrees: selection.allWorktrees,
        provider: 'codehub',
        number: item.iid,
        sourceContext,
        repoId: item.repoId
      })
      if (
        scoped &&
        dispatchScopedWorktrees({
          candidates: scoped.candidates,
          choiceTitle: `#${item.iid} ${item.title}`,
          onUnavailable: notifyScopedWorkspaceUnavailable
        }) !== 'none'
      ) {
        return
      }
    }
    selection.openModal('new-workspace-composer', {
      initialRepoId: item.repoId,
      linkedWorkItem: {
        provider: 'codehub',
        type: item.type,
        number: item.iid,
        title: item.title,
        url: item.url,
        repoId: item.repoId
      },
      prefilledName: getLinkedWorkItemSuggestedName(item),
      taskSourceContext: sourceContext,
      initialWorkspaceTarget: sourceContext
        ? {
            projectId: sourceContext.projectId,
            hostId: sourceContext.hostId,
            projectHostSetupId: sourceContext.projectHostSetupId
          }
        : null,
      enableIssueAutomation: item.type === 'issue',
      telemetrySource: 'sidebar',
      ...resolveScopedComposerAdditions({
        scope,
        repoMap: selection.repoMap,
        item: { repoId: item.repoId, type: item.type, number: item.iid, provider: 'codehub' }
      })
    })
  }

  const controls = {
    codehubView,
    setCodehubView,
    codehubState,
    setCodehubState,
    codehubPreset,
    setCodehubPreset,
    codehubQuery,
    setCodehubQuery,
    codehubAuthor,
    setCodehubAuthor,
    codehubAssignee,
    setCodehubAssignee,
    codehubLabels,
    setCodehubLabels,
    codehubLoading,
    setCodehubRefreshNonce,
    selectedRepos
  }

  const scopeModel = {
    workbenchScope: scope,
    workbenchScopeActive: !!scope?.goalId,
    workbenchScopeLoading: codehubLoading,
    workbenchScopeMissing: codehubScopeMissing,
    workbenchScopeReadyCount: codehubScopeReadyCount,
    workbenchScopeError: codehubError,
    clearWorkbenchVersion: clearWorkbenchProject,
    clearWorkbenchGoal
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col px-5 pt-1.5 pb-4 md:px-8 md:pb-5">
        {detail.codehubDetailItem ? (
          <TaskPageCodeHubDetail
            model={{ ...detail, pageData, handleUseCodeHubItem, setCodehubRefreshNonce }}
          />
        ) : (
          <>
            <div
              className="flex min-w-0 flex-wrap items-center gap-2"
              data-contextual-tour-target="tasks-source-filters"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-full"
                    onClick={closeTaskPage}
                    aria-label={t('auto.components.TaskPage.1a06219d5c', 'Close tasks')}
                  >
                    <X className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {t('auto.components.TaskPage.4826fd1ad8', 'Close · Esc')}
                </TooltipContent>
              </Tooltip>
              <div className="mx-1 h-5 w-px bg-border/50" aria-hidden />
              {selection.visibleSourceOptions.map((source) => (
                <TaskPageSourceChip
                  key={source.id}
                  id={source.id}
                  label={source.label}
                  Icon={source.Icon}
                  active={false}
                  disabled={source.disabled}
                  onSelect={() => {
                    openTaskPage({ taskSource: source.id }, { recordTasksInteraction: false })
                    void updateSettings({ defaultTaskSource: source.id }).catch(() => {
                      toast.error(
                        t(
                          'auto.components.TaskPage.609532fae7',
                          'Failed to save default task source.'
                        )
                      )
                    })
                  }}
                />
              ))}
              <TaskPageSourceChip
                id="codehub"
                label="CodeHub"
                Icon={GitPullRequest}
                active
                onSelect={() => {}}
              />
            </div>
            <TaskPageCodeHubFilters
              model={{
                ...controls,
                eligibleRepos,
                repoSelection: selection.repoSelection,
                setRepoSelection: selection.setRepoSelection,
                taskPickerGroups,
                taskPickerRepos,
                getTaskPickerRepoHostLabel: (repo) => {
                  const hostId = getRepoExecutionHostId(repo)
                  const host = parseExecutionHostId(hostId)
                  if (host?.kind === 'runtime') {
                    return (
                      selection.runtimeEnvironments.find(
                        (environment) => environment.id === host.environmentId
                      )?.name ?? getExecutionHostLabel(hostId)
                    )
                  }
                  return getExecutionHostLabel(hostId)
                },
                updateSettings,
                workbenchScope: !!scope,
                clearWorkbenchProject
              }}
            />
            <TaskPageScopeHeader model={scopeModel} />
            <TaskPageCodeHubItemList
              model={{
                ...controls,
                codehubItems,
                codehubError,
                codehubHasMore,
                ...scopeModel,
                allWorktrees: selection.allWorktrees,
                setCodehubDetailItem: detail.setCodehubDetailItem,
                handleUseCodeHubItem
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
