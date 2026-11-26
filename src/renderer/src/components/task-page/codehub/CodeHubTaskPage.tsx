import { useEffect, useMemo, useState } from 'react'
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
import type { TaskPageRepoSelectionModel } from '../use-task-page-repo-selection'
import { useTaskPageCodeHubLoading, type CodeHubTaskRow } from '../../use-task-page-codehub-loading'
import { TaskPageCodeHubDetail } from './Detail'
import { TaskPageCodeHubFilters } from './Filters'
import { TaskPageCodeHubItemList } from './ItemList'
import { useCodeHubDetailItem } from './use-codehub-detail-item'

export function CodeHubTaskPage({
  selection
}: {
  selection: TaskPageRepoSelectionModel
}): React.JSX.Element {
  const { pageData, closeTaskPage, updateSettings } = selection
  const scope = pageData.workbenchTaskScope ?? null
  const selectedRepos = useMemo(
    () => selection.selectedRepos.filter((repo) => isCodeHubGitRemote(repo.gitRemoteIdentity)),
    [selection.selectedRepos]
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
            <TaskPageCodeHubFilters
              model={{
                ...controls,
                eligibleRepos: selection.eligibleRepos,
                repoSelection: selection.repoSelection,
                setRepoSelection: selection.setRepoSelection,
                taskPickerGroups: selection.taskPickerGroups,
                taskPickerRepos: selection.taskPickerRepos,
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
