import { useEffect, useMemo, useRef, useState } from 'react'
import type { TaskPageJiraCreationMetadataModel } from './use-task-page-jira-creation-metadata'
import { parseTaskQuery } from '../../../shared/task-query'
import {
  workbenchTaskScopeKey,
  workbenchVersionTaskLabel,
  seedWorkbenchTaskQuery,
  removeWorkbenchVersionQuery
} from '../../../shared/workbench/task-scope'
import {
  loadWorkbenchTaskScope,
  cachedWorkbenchTaskScope,
  requireVersionTaskScopeHome,
  type TaskScopeLoadResult
} from '@/workbench/task-scope-load'
import { nativeTaskReferenceReader } from '@/workbench/native-task-port'
import {
  projectWorkbenchTaskScope,
  buildCodeHubGoalQuery,
  resolveWorkbenchTaskScopeFilters,
  workbenchTaskScopeItemKeys,
  type WorkbenchTaskScopeModelFields
} from '@/workbench/task-scope-projection'
import { useAppStore } from '@/store'
import { useTaskScopeViewers } from '@/workbench/use-task-scope-viewers'

/** Only a selected goal materializes references; a version uses native queries. */
export function useTaskPageWorkbenchScope(model: TaskPageJiraCreationMetadataModel) {
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
  const entry = pageData.workbenchTaskScope ?? null
  const versionLabel = entry ? workbenchVersionTaskLabel(entry.version) : null
  const query = parseTaskQuery(model.appliedTaskSearch)
  const entryKey = entry ? JSON.stringify([entry.version, pageData.preselectedRepoId]) : ''
  const [seededEntryKey, setSeededEntryKey] = useState(entryKey)
  const previousEntry = useRef(entry)
  const scope =
    entry &&
    (model.taskSource !== 'github' ||
      query.labels.includes(versionLabel!) ||
      seededEntryKey !== entryKey)
      ? entry
      : null
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
      return requireVersionTaskScopeHome(pageData.preselectedRepoId, { repos, activeRepoId })
    } catch {
      return null
    }
  }, [goalScope, pageData.preselectedRepoId, repos, activeRepoId])
  const scopeKey =
    goalScope && home
      ? JSON.stringify([
          workbenchTaskScopeKey(goalScope),
          nativeTaskReferenceReader.key(home, goalScope.references)
        ])
      : null
  const cached = useMemo(
    () => (goalScope && home ? cachedWorkbenchTaskScope(goalScope, home) : null),
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
    if (!entry) {
      previousEntry.current = null
      setSeededEntryKey('')
      return
    }
    if (!taskResumeApplied || seededEntryKey === entryKey) {
      return
    }
    setSeededEntryKey(entryKey)
    const next = seedWorkbenchTaskQuery(model.appliedTaskSearch, entry, previousEntry.current)
    previousEntry.current = entry
    model.setTaskSearchInput(next)
    model.setAppliedTaskSearch(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey, seededEntryKey, taskResumeApplied])
  useEffect(() => {
    if (!entry || scope || !taskResumeApplied) {
      return
    }
    useAppStore.setState((state) => ({
      taskPageData: { ...state.taskPageData, workbenchTaskScope: null }
    }))
  }, [entry, scope, taskResumeApplied])

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
        const target = home ?? requireVersionTaskScopeHome(pageData.preselectedRepoId)
        const loaded = await loadWorkbenchTaskScope(goalScope, target, force)
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

  const selectedRepoKey = [...model.repoSelection].sort().join('|')
  const codehubGoalQuery = buildCodeHubGoalQuery(model, goalScope)
  const goalViewers = useTaskScopeViewers(model, result, !!goalScope && goalIssueView)
  const { filterProblem } = resolveWorkbenchTaskScopeFilters({
    active: !!goalScope && goalIssueView,
    taskSource: model.taskSource,
    githubQuery: model.appliedTaskSearch,
    viewerError: goalViewers.error
  })
  useEffect(() => {
    if (!goalScope || !result) {
      return
    }
    const { githubPages, codehubItems } = projectWorkbenchTaskScope({
      result,
      selectedRepoIds: model.repoSelection,
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
  const itemKeys = useMemo(() => workbenchTaskScopeItemKeys(result), [result])
  const clearVersion = () => {
    if (!entry) {
      return
    }
    model.setTasksRefreshing(false)
    const next = removeWorkbenchVersionQuery(model.appliedTaskSearch, entry)
    model.setTaskSearchInput(next)
    model.setAppliedTaskSearch(next)
    model.setTasksFiltering(true)
    useAppStore.setState((state) => ({
      taskPageData: { ...state.taskPageData, workbenchTaskScope: null }
    }))
  }
  const clearProject = () => {
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
    useAppStore.setState((state) => ({
      taskPageData: {
        ...state.taskPageData,
        workbenchTaskScope: { ...scope, goalId: null, goalLabel: null, references: [] }
      }
    }))
  }
  const nextModel = model as typeof model & WorkbenchTaskScopeModelFields
  nextModel.workbenchScopeActive = goalScope !== null
  nextModel.workbenchScope = scope
  nextModel.workbenchScopeLoading =
    scopeLoading || goalViewers.loading || (!!goalScope && goalIssueView && !result && !scopeError)
  nextModel.workbenchScopeError = goalScope && goalIssueView ? (filterProblem ?? scopeError) : null
  nextModel.workbenchScopeMissing = goalScope && goalIssueView ? (result?.missing ?? []) : []
  nextModel.workbenchScopeReadyCount =
    goalScope && result ? result.githubItems.length + result.codehubItems.length : 0
  nextModel.workbenchScopeViewProvider = result?.viewProvider ?? null
  nextModel.workbenchScopeItemKeys = itemKeys.github
  nextModel.workbenchScopeCodeHubItemKeys = itemKeys.codehub
  nextModel.workbenchScopeViewerLogins = goalViewers.logins
  nextModel.clearWorkbenchProject = clearProject
  nextModel.clearWorkbenchVersion = clearVersion
  nextModel.clearWorkbenchGoal = clearGoal
  return nextModel
}
export type TaskPageWorkbenchScopeModel = ReturnType<typeof useTaskPageWorkbenchScope>
