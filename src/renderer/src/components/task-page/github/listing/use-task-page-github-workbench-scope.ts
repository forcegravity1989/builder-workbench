import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { nativeTaskReferenceReader } from '@/workbench/native-task-port'
import { resolveReferenceRepo } from '@/workbench/task-reference-repo'
import {
  cachedWorkbenchTaskScope,
  loadWorkbenchTaskScope,
  requireVersionTaskScopeHome,
  type TaskScopeLoadResult
} from '@/workbench/task-scope-load'
import {
  projectWorkbenchTaskScope,
  resolveWorkbenchTaskScopeFilters
} from '@/workbench/task-scope-projection'
import { useTaskScopeViewers } from '@/workbench/use-task-scope-viewers'
import { useWorkbenchScreenUsage } from '@/workbench/workbench-screen-usage'
import { parseTaskQuery } from '../../../../../../shared/work-items/task-query'
import { getTaskRepoProjectKey } from '../../../../../../shared/work-items/task-repo-selection'
import {
  removeWorkbenchVersionQuery,
  workbenchTaskEntryQuery,
  workbenchTaskScopeKey,
  workbenchVersionTaskLabel,
  type WorkbenchTaskScope
} from '../../../../../../shared/workbench/task-scope'
import type { TaskPageJiraCreationMetadataModel } from '../../jira/creation/use-task-page-jira-creation-metadata'

export function useTaskPageGitHubWorkbenchScope(model: TaskPageJiraCreationMetadataModel) {
  const {
    pageData,
    repos,
    eligibleRepos,
    repoSelection,
    resolvedInitialSelection,
    setRepoSelection,
    taskSource,
    taskResumeApplied,
    appliedTaskSearch,
    setTaskSearchInput,
    setAppliedTaskSearch,
    setActiveTaskPreset,
    setGithubMode,
    activeGithubTaskKind,
    taskRefreshNonce,
    quietRefreshNonce,
    workItemsInvalidationNonce
  } = model
  const activeRepoId = useAppStore((state) => state.activeRepoId)
  const entry =
    isWorkbenchShell() && taskSource === 'github' ? (pageData.workbenchTaskScope ?? null) : null
  const entryKey = entry
    ? JSON.stringify([
        workbenchTaskScopeKey(entry),
        entry.homeHostId,
        entry.runtimeOwnerEnvironmentId,
        pageData.preselectedRepoId
      ])
    : null
  const [seededEntryKey, setSeededEntryKey] = useState<string | null>(null)
  const previousEntry = useRef<WorkbenchTaskScope | null>(null)
  const scopePreparing = entryKey !== seededEntryKey && entry !== null
  const versionLabel = entry ? workbenchVersionTaskLabel(entry.version) : null
  const scopedByQuery =
    versionLabel !== null && parseTaskQuery(appliedTaskSearch).labels.includes(versionLabel)
  const scope = entry && (entry.goalId || scopePreparing || scopedByQuery) ? entry : null
  const goal = scope?.goalId ? scope : null
  const goalIssueView = activeGithubTaskKind === 'issues'
  useWorkbenchScreenUsage('workbench-version-tasks', scope !== null)

  const home = useMemo(() => {
    if (!entry) {
      return null
    }
    try {
      return requireVersionTaskScopeHome(
        pageData.preselectedRepoId,
        { repos, activeRepoId },
        entry.homeHostId,
        entry.runtimeOwnerEnvironmentId
      )
    } catch {
      return null
    }
  }, [entry, pageData.preselectedRepoId, repos, activeRepoId])
  const goalKey =
    goal && home
      ? JSON.stringify([entryKey, nativeTaskReferenceReader.key(home, goal.references)])
      : null
  const cached = useMemo(
    () => (goal && home ? cachedWorkbenchTaskScope(goal, home) : null),
    // The reader key includes the exact home and normalized reference identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goalKey]
  )
  const [load, setLoad] = useState<{
    key: string
    result: TaskScopeLoadResult | null
    error: string | null
  } | null>(null)
  const current = load?.key === goalKey ? load : null
  const result = current?.result ?? cached
  const refreshKey = JSON.stringify([
    taskRefreshNonce,
    quietRefreshNonce,
    workItemsInvalidationNonce
  ])
  const lastRequest = useRef<{ key: string; refresh: string } | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [goalPage, setGoalPage] = useState(0)

  useEffect(() => {
    if (!entry) {
      previousEntry.current = null
      setSeededEntryKey(null)
      return
    }
    if (!taskResumeApplied || !scopePreparing) {
      return
    }
    const next = workbenchTaskEntryQuery(appliedTaskSearch, entry, previousEntry.current)
    previousEntry.current = entry
    setSeededEntryKey(entryKey)
    setGithubMode('items')
    setActiveTaskPreset(null)
    setTaskSearchInput(next)
    setAppliedTaskSearch(next)
    if (entry.goalId && home) {
      const referenceRepos = entry.references.flatMap((reference) => {
        const repo = resolveReferenceRepo({ repos: () => eligibleRepos }, home, reference)
        return repo ? [repo.id] : []
      })
      setRepoSelection(referenceRepos.length ? new Set(referenceRepos) : resolvedInitialSelection)
    } else if (home) {
      setRepoSelection(new Set([home.repoId]))
    }
    // The query submitted after entry must not re-seed this scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey, scopePreparing, taskResumeApplied])

  useEffect(() => {
    if (entry && taskResumeApplied && !scope) {
      useAppStore.setState((state) => ({
        taskPageData: { ...state.taskPageData, workbenchTaskScope: null }
      }))
    }
  }, [entry, scope, taskResumeApplied])

  useEffect(() => {
    if (!goal || !home || !goalKey || !taskResumeApplied || !goalIssueView) {
      return
    }
    let cancelled = false
    const previous = lastRequest.current
    const force = previous?.key === goalKey && previous.refresh !== refreshKey
    lastRequest.current = { key: goalKey, refresh: refreshKey }
    setLoadingKey(goalKey)
    void loadWorkbenchTaskScope(goal, home, force)
      .then((loaded) => {
        if (!cancelled) {
          setLoad({ key: goalKey, result: loaded, error: null })
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoad({
            key: goalKey,
            result: null,
            error: reason instanceof Error ? reason.message : String(reason)
          })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingKey(null)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalKey, refreshKey, taskResumeApplied, goalIssueView])

  const selectedScopeRepoIds = useMemo(() => {
    const selectedProjects = new Set(
      eligibleRepos.filter((repo) => repoSelection.has(repo.id)).map(getTaskRepoProjectKey)
    )
    return new Set(
      eligibleRepos
        .filter((repo) => selectedProjects.has(getTaskRepoProjectKey(repo)))
        .map((repo) => repo.id)
    )
  }, [eligibleRepos, repoSelection])
  const goalViewers = useTaskScopeViewers(
    {
      ...model,
      selectedScopeRepoIds,
      taskRefreshNonce,
      codehubRefreshNonce: 0,
      codehubPreset: '',
      codehubAuthor: '',
      codehubAssignee: ''
    },
    result,
    !!goal && goalIssueView
  )
  const { filterProblem } = resolveWorkbenchTaskScopeFilters({
    active: !!goal && goalIssueView,
    taskSource,
    githubQuery: appliedTaskSearch,
    viewerError: goalViewers.error
  })
  const goalError =
    goal && goalIssueView
      ? (filterProblem ?? current?.error ?? (home ? null : '无法解析当前项目的任务范围宿主'))
      : null
  const workbenchScopeLoading =
    scopePreparing ||
    (!!goal &&
      goalIssueView &&
      !goalError &&
      ((!current && !cached) || loadingKey === goalKey || goalViewers.loading))
  const goalPages = useMemo(
    () =>
      result
        ? projectWorkbenchTaskScope({
            result,
            selectedRepoIds: selectedScopeRepoIds,
            githubIssueView: goalIssueView,
            githubQuery: appliedTaskSearch,
            viewerLogins: goalViewers.logins,
            githubPageSize: model.githubPageSize,
            codehubIssueView: false,
            codehubQuery: '',
            codehubPreset: '',
            blocked: !goal || !!filterProblem || goalViewers.loading || scopePreparing
          }).githubPages
        : [[]],
    [
      result,
      goal,
      selectedScopeRepoIds,
      goalIssueView,
      appliedTaskSearch,
      goalViewers.logins,
      goalViewers.loading,
      model.githubPageSize,
      filterProblem,
      scopePreparing
    ]
  )
  useEffect(() => {
    setGoalPage(0)
  }, [entryKey, appliedTaskSearch, selectedScopeRepoIds])
  useEffect(() => {
    if (goal && !workbenchScopeLoading) {
      model.setTasksFiltering(false)
      model.setTasksRefreshing(false)
    }
  }, [goal, model.setTasksFiltering, model.setTasksRefreshing, refreshKey, workbenchScopeLoading])

  function setScope(next: WorkbenchTaskScope | null): void {
    useAppStore.setState((state) => ({
      taskPageData: { ...state.taskPageData, workbenchTaskScope: next }
    }))
  }
  function clearWorkbenchVersion(): void {
    if (!entry) {
      return
    }
    const next = entry.goalId
      ? appliedTaskSearch
      : removeWorkbenchVersionQuery(appliedTaskSearch, entry)
    setTaskSearchInput(next)
    setAppliedTaskSearch(next)
    if (home) {
      setRepoSelection(new Set([home.repoId]))
    }
    setScope(null)
  }
  function clearWorkbenchProject(): void {
    if (entry && !entry.goalId) {
      clearWorkbenchVersion()
    }
  }
  function clearWorkbenchGoal(): void {
    if (goal) {
      setScope({ ...goal, goalId: null, goalLabel: null, references: [] })
    }
  }

  return Object.assign(model, {
    workbenchScope: scope,
    workbenchScopeActive: !!goal,
    workbenchScopeLoading,
    workbenchScopeError: goalError,
    workbenchScopeMissing: goal && goalIssueView ? (result?.missing ?? []) : [],
    workbenchScopeReadyCount: goal && goalIssueView ? (result?.githubItems.length ?? 0) : 0,
    workbenchNativeGitHubListBlocked: !!goal || scopePreparing,
    githubGoalPages: goalPages,
    githubGoalPage: Math.min(goalPage, goalPages.length - 1),
    setGitHubGoalPage: setGoalPage,
    clearWorkbenchVersion,
    clearWorkbenchProject,
    clearWorkbenchGoal
  })
}

export type TaskPageGitHubWorkbenchScopeModel = ReturnType<typeof useTaskPageGitHubWorkbenchScope>
