import { useEffect, useMemo, useRef, useState } from 'react'
import type { TaskPageJiraCreationMetadataModel } from './use-task-page-jira-creation-metadata'
import { useTaskPageMonicaEntry } from './use-task-page-monica-entry'
import {
  monicaTaskScopeKey,
  removeMonicaVersionQuery,
  type MonicaTaskScope
} from '../../../shared/monica/task-scope'
import {
  loadMonicaTaskScope,
  cachedMonicaTaskScope,
  requireVersionTaskScopeHome,
  versionTaskRepoProvider,
  type TaskScopeLoadResult
} from '@/monica/task-scope-load'
import { nativeTaskReferenceReader } from '@/monica/native-task-port'
import {
  projectMonicaTaskScope,
  buildCodeHubGoalQuery,
  resolveMonicaTaskScopeFilters,
  monicaTaskScopeItemKeys,
  type MonicaTaskScopeModelFields
} from '@/monica/task-scope-projection'
import { useAppStore } from '@/store'
import { useTaskScopeViewers } from '@/monica/use-task-scope-viewers'
import { useMonicaScreenUsage } from '@/monica/monica-screen-usage'

/** Only a selected goal materializes references; a version uses native queries. */
export function useTaskPageMonicaScope(model: TaskPageJiraCreationMetadataModel) {
  const {
    pageData,
    taskResumeApplied,
    taskRefreshNonce,
    codehubRefreshNonce,
    workItemsInvalidationNonce,
    githubPageSize,
    setPages,
    setCurrentPage,
    setCountedTotalPages,
    setTasksLoading,
    setTasksError,
    setTasksFiltering,
    setCodehubItems,
    setCodehubLoading,
    setCodehubError
  } = model
  const { entry, scope } = useTaskPageMonicaEntry(model)
  // Why: the version-scoped task screen is a BW surface (#687) — count entry
  // once per scope activation, not per goal/version switch inside the screen.
  useMonicaScreenUsage('monica-version-tasks', scope !== null)
  const goalScope = scope?.goalId ? scope : null
  const goalIssueView =
    model.taskSource === 'codehub'
      ? model.codehubView === 'issues'
      : model.activeGithubTaskKind === 'issues'
  const repos = useAppStore((state) => state.repos)
  const activeRepoId = useAppStore((state) => state.activeRepoId)
  const home = useMemo(() => {
    if (!goalScope) {
      return null
    }
    try {
      return requireVersionTaskScopeHome(
        pageData.preselectedRepoId,
        { repos, activeRepoId },
        goalScope.homeHostId,
        goalScope.runtimeOwnerEnvironmentId
      )
    } catch {
      return null
    }
  }, [goalScope, pageData.preselectedRepoId, repos, activeRepoId])
  const scopeKey =
    goalScope && home
      ? JSON.stringify([
          monicaTaskScopeKey(goalScope),
          nativeTaskReferenceReader.key(home, goalScope.references)
        ])
      : null
  const cached = useMemo(
    () => (goalScope && home ? cachedMonicaTaskScope(goalScope, home) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey]
  )
  const refreshKey = JSON.stringify([
    taskRefreshNonce,
    codehubRefreshNonce,
    workItemsInvalidationNonce
  ])
  const lastRequest = useRef({ scopeKey, refreshKey })
  const [scopeLoad, setScopeLoad] = useState<{ key: string; result: TaskScopeLoadResult } | null>(
    null
  )
  const [scopeLoading, setScopeLoading] = useState(false)
  const [scopeError, setScopeError] = useState<string | null>(null)
  const result = scopeLoad && scopeLoad.key === scopeKey ? scopeLoad.result : cached

  useEffect(() => {
    if (!goalScope || !taskResumeApplied || !goalIssueView) {
      setScopeLoading(false)
      if (goalScope && !goalIssueView) {
        setPages([[]])
        setCodehubItems([])
        setCountedTotalPages(1)
        setTasksLoading(false)
        setCodehubLoading(false)
        model.setTasksRefreshing(false)
        setTasksFiltering(false)
      }
      return
    }
    let cancelled = false
    const force =
      lastRequest.current.scopeKey === scopeKey && lastRequest.current.refreshKey !== refreshKey
    lastRequest.current = { scopeKey, refreshKey }
    setScopeLoading(true)
    setScopeError(null)
    model.setFailedCount(0)
    model.setGithubUnavailable(false)
    setTasksError(null)
    setCodehubError(null)
    setTasksLoading(!result)
    setCodehubLoading(!result)
    void (async () => {
      try {
        const target =
          home ??
          requireVersionTaskScopeHome(
            pageData.preselectedRepoId,
            undefined,
            goalScope.homeHostId,
            goalScope.runtimeOwnerEnvironmentId
          )
        const loaded = await loadMonicaTaskScope(goalScope, target, force)
        if (cancelled) {
          return
        }
        if (scopeKey) {
          setScopeLoad({ key: scopeKey, result: loaded })
        }
        setScopeError(null)
        setTasksError(null)
        setCodehubError(null)
      } catch (reason) {
        if (cancelled) {
          return
        }
        const message = reason instanceof Error ? reason.message : String(reason)
        setScopeError(message)
        if (!result) {
          setPages([[]])
          setCurrentPage(0)
          setCountedTotalPages(null)
          setCodehubItems([])
        }
      } finally {
        if (!cancelled) {
          setScopeLoading(false)
          setTasksLoading(false)
          setCodehubLoading(false)
          model.setTasksRefreshing(false)
          setTasksFiltering(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scopeKey,
    goalIssueView,
    taskResumeApplied,
    taskRefreshNonce,
    codehubRefreshNonce,
    workItemsInvalidationNonce
  ])

  const selectedRepoKey = [...model.selectedScopeRepoIds].sort().join('|')
  const codehubGoalQuery = buildCodeHubGoalQuery(model)
  const goalViewers = useTaskScopeViewers(model, result, !!goalScope && goalIssueView)
  const { filterProblem } = resolveMonicaTaskScopeFilters({
    active: !!goalScope && goalIssueView,
    taskSource: model.taskSource,
    githubQuery: model.appliedTaskSearch,
    viewerError: goalViewers.error
  })
  useEffect(() => {
    if (!goalScope || !result) {
      return
    }
    const { githubPages, codehubItems } = projectMonicaTaskScope({
      result,
      selectedRepoIds: model.selectedScopeRepoIds,
      githubIssueView: model.activeGithubTaskKind !== 'prs',
      githubQuery: model.appliedTaskSearch,
      viewerLogins: goalViewers.logins,
      githubPageSize,
      codehubIssueView: model.codehubView !== 'mrs',
      codehubQuery: codehubGoalQuery,
      codehubPreset: model.codehubPreset,
      blocked: !!filterProblem || goalViewers.loading
    })
    setPages(githubPages)
    setCurrentPage(0)
    setCountedTotalPages(githubPages.length)
    setCodehubItems(codehubItems)
    setTasksFiltering(false)
    setTasksLoading(scopeLoading || goalViewers.loading)
    setCodehubLoading(scopeLoading || goalViewers.loading)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scopeKey,
    result,
    selectedRepoKey,
    model.activeGithubTaskKind,
    model.appliedTaskSearch,
    goalViewers.logins,
    goalViewers.loading,
    scopeLoading,
    model.codehubView,
    codehubGoalQuery,
    model.codehubPreset,
    filterProblem,
    githubPageSize
  ])
  const itemKeys = useMemo(() => monicaTaskScopeItemKeys(result), [result])
  const removeScope = (next: MonicaTaskScope | null) => {
    const repo = pageData.preselectedRepoId ? model.repoMap.get(pageData.preselectedRepoId) : null
    const home = entry?.goalId ? repo : null
    if (home) {
      model.setRepoSelection(new Set([home.id]))
    }
    useAppStore.setState((state) => ({
      taskPageData: {
        ...state.taskPageData,
        ...(home ? { taskSource: versionTaskRepoProvider(home) } : {}),
        monicaTaskScope: next
      }
    }))
  }
  const clearVersion = () => {
    if (!entry) {
      return
    }
    model.setTasksRefreshing(false)
    const next = entry.goalId
      ? model.appliedTaskSearch
      : removeMonicaVersionQuery(model.appliedTaskSearch, entry)
    model.setTaskSearchInput(next)
    model.setAppliedTaskSearch(next)
    model.setTasksFiltering(true)
    removeScope(null)
  }
  const clearProject = () => {
    // In a goal, the project picker narrows its references just like the other native filters.
    if (scope?.goalId) {
      return
    }
    clearVersion()
    useAppStore.setState((state) => ({
      taskPageData: { ...state.taskPageData, preselectedRepoId: undefined, taskSource: undefined }
    }))
  }
  const clearGoal = () => {
    if (!scope) {
      return
    }
    model.setTasksRefreshing(false)
    model.setTasksFiltering(true)
    removeScope({ ...scope, goalId: null, goalLabel: null, references: [] })
  }
  const nextModel = model as typeof model & MonicaTaskScopeModelFields
  nextModel.monicaScopeActive = goalScope !== null
  nextModel.monicaScope = scope
  nextModel.monicaScopeLoading =
    scopeLoading || goalViewers.loading || (!!goalScope && goalIssueView && !result && !scopeError)
  nextModel.monicaScopeError = goalScope && goalIssueView ? (filterProblem ?? scopeError) : null
  nextModel.monicaScopeMissing = goalScope && goalIssueView ? (result?.missing ?? []) : []
  nextModel.monicaScopeReadyCount =
    goalScope && result ? result.githubItems.length + result.codehubItems.length : 0
  nextModel.monicaScopeViewProvider = result?.viewProvider ?? null
  nextModel.monicaScopeItemKeys = itemKeys.github
  nextModel.monicaScopeCodeHubItemKeys = itemKeys.codehub
  nextModel.monicaScopeViewerLogins = goalViewers.logins
  nextModel.clearMonicaProject = clearProject
  nextModel.clearMonicaVersion = clearVersion
  nextModel.clearMonicaGoal = clearGoal
  return nextModel
}
export type TaskPageMonicaScopeModel = ReturnType<typeof useTaskPageMonicaScope>
