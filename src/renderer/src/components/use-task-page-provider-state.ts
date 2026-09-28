import type { TaskPageSourceAvailabilityModel } from './use-task-page-source-availability'
import { useRef, useState, useEffect, useMemo } from 'react'
import { resolveVisibleTaskProvider } from '../../../shared/task-providers'
import type { GitLabTaskFilter, GitLabIssueFilter } from '@/components/task-page-localized-options'
import type { GitLabWorkItem, GitLabTodo } from '../../../shared/gitlab-types'
import { getRepoBackedTaskEmptyState } from '@/components/task-page-empty-state'
import { isGitLabIssueFilter, isGitLabMRFilter } from './task-page-source-context'
import { useCodeHubDetailItem } from './task-page/codehub/use-codehub-detail-item'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
export function useTaskPageProviderState(model: TaskPageSourceAvailabilityModel) {
  const {
    settings,
    pageData,
    selectedRepos,
    visibleTaskProviders,
    preferredTaskSource,
    taskSource,
    setTaskSource
  } = model
  const taskSourceManuallyChangedRef = useRef(false)
  const lastPageTaskSourceRef = useRef(pageData.taskSource)
  const taskResumeAppliedRef = useRef(false)
  const githubSearchPersistReadyRef = useRef(false)
  const linearSearchPersistReadyRef = useRef(false)
  const linearViewPersistReadyRef = useRef(false)
  const jiraSearchPersistReadyRef = useRef(false)
  const [taskResumeApplied, setTaskResumeApplied] = useState(false)
  const selectionIsCodeHub =
    selectedRepos.length > 0 &&
    selectedRepos.every((repo) => isCodeHubGitRemote(repo.gitRemoteIdentity))
  const suppressCodeHubAutoRef = useRef(false)
  const codeHubSelectionKeyRef = useRef('')

  // Why: useState only inits once, so sync taskSource from the store when a sidebar source-icon click changes pageData.taskSource.
  useEffect(() => {
    const pageTaskSourceChanged = lastPageTaskSourceRef.current !== pageData.taskSource
    lastPageTaskSourceRef.current = pageData.taskSource
    if (pageData.taskSource) {
      if (pageTaskSourceChanged) {
        taskSourceManuallyChangedRef.current = false
        suppressCodeHubAutoRef.current = pageData.taskSource !== 'codehub'
      } else if (taskSourceManuallyChangedRef.current) {
        return
      }
      const saved = resolveVisibleTaskProvider(pageData.taskSource, visibleTaskProviders)
      if (
        selectionIsCodeHub &&
        visibleTaskProviders.includes('codehub') &&
        !suppressCodeHubAutoRef.current &&
        saved !== 'codehub'
      ) {
        setTaskSource('codehub')
        return
      }
      setTaskSource(saved)
    }
  }, [pageData.taskSource, selectionIsCodeHub, visibleTaskProviders, setTaskSource])
  useEffect(() => {
    const selectionKey = selectedRepos
      .map((repo) => repo.id)
      .sort()
      .join(',')
    if (codeHubSelectionKeyRef.current !== selectionKey) {
      codeHubSelectionKeyRef.current = selectionKey
      suppressCodeHubAutoRef.current = false
    }
    if (taskSourceManuallyChangedRef.current) {
      return
    }
    if (
      selectionIsCodeHub &&
      visibleTaskProviders.includes('codehub') &&
      !suppressCodeHubAutoRef.current
    ) {
      if (taskSource !== 'codehub') {
        setTaskSource('codehub')
      }
      return
    }
    // Why: GitLab/Linear availability hydrates after mount; restore the saved default once its provider check proves it can be shown.
    if (visibleTaskProviders.includes(preferredTaskSource) && taskSource !== preferredTaskSource) {
      setTaskSource(preferredTaskSource)
    }
  }, [
    preferredTaskSource,
    selectedRepos,
    selectionIsCodeHub,
    taskSource,
    visibleTaskProviders,
    setTaskSource
  ])
  useEffect(() => {
    if (!visibleTaskProviders.includes(taskSource)) {
      setTaskSource(resolveVisibleTaskProvider(settings?.defaultTaskSource, visibleTaskProviders))
    }
  }, [settings?.defaultTaskSource, taskSource, visibleTaskProviders, setTaskSource])

  // Why: Project mode is a GitHub sub-tab — visible on the GitHub source, but actual entry is gated on a non-null activeProject.
  const projectModeVisible = taskSource === 'github'
  const [githubMode, setGithubMode] = useState<'items' | 'project'>('items')

  // ── GitLab task-source state ──────────────────────────────────────
  // Why: parallel to Linear's slim per-source state — skips workItemsCache and cross-repo aggregation; fetches directly via window.api.gl for the primary repo.
  const [gitlabFilter, setGitlabFilter] = useState<GitLabTaskFilter | GitLabIssueFilter>('opened')
  const [gitlabItems, setGitlabItems] = useState<GitLabWorkItem[]>([])
  const [gitlabLoading, setGitlabLoading] = useState(false)
  const [gitlabError, setGitlabError] = useState<string | null>(null)
  const [gitlabRefreshNonce, setGitlabRefreshNonce] = useState(0)
  // Why: separate from gitlabItems so the dialog target survives a list refresh that removes the item from the visible filter (e.g. closing an MR).
  const [gitlabDialogItem, setGitlabDialogItem] = useState<GitLabWorkItem | null>(null)

  // Why: GitLab tab has two sub-views — the project MR/issue list and the user's cross-project Todos (a separate stream).
  const [gitlabView, setGitlabView] = useState<'issues' | 'mrs' | 'todos'>('mrs')
  const [gitlabTodos, setGitlabTodos] = useState<GitLabTodo[]>([])
  const [gitlabTodosLoading, setGitlabTodosLoading] = useState(false)
  const gitlabEmptyState = useMemo(
    () =>
      getRepoBackedTaskEmptyState({
        provider: 'gitlab',
        selectedRepoCount: selectedRepos.length,
        gitlabView
      }),
    [gitlabView, selectedRepos.length]
  )
  const gitlabFilterIsValid =
    gitlabView === 'issues'
      ? isGitLabIssueFilter(gitlabFilter)
      : gitlabView === 'mrs'
        ? isGitLabMRFilter(gitlabFilter)
        : true
  const activeGitlabFilter = gitlabFilterIsValid ? gitlabFilter : 'opened'
  // Why: Issues and MRs expose different filter sets; repair before commit so fetch effects never run glab with a stale filter from the other view.
  if (!gitlabFilterIsValid) {
    setGitlabFilter('opened')
  }
  const displayedGitLabItems = useMemo(() => {
    if (gitlabView === 'issues') {
      return gitlabItems.filter((item) => item.type === 'issue')
    }
    if (gitlabView === 'mrs') {
      return gitlabItems.filter((item) => item.type === 'mr')
    }
    return gitlabItems
  }, [gitlabItems, gitlabView])
  const [codehubView, setCodehubView] = useState<'issues' | 'mrs'>('issues')
  const [codehubState, setCodehubState] = useState<'opened' | 'closed' | 'merged' | 'all'>('opened')
  const [codehubItems, setCodehubItems] = useState<CodeHubTaskItem[]>([])
  const [codehubLoading, setCodehubLoading] = useState(false)
  const [codehubError, setCodehubError] = useState<string | null>(null)
  const [codehubRefreshNonce, setCodehubRefreshNonce] = useState(0)
  const { codehubDetailItem, setCodehubDetailItem } = useCodeHubDetailItem(model)
  const [codehubQuery, setCodehubQuery] = useState('')
  const [codehubPreset, setCodehubPreset] = useState<'open' | 'mine' | 'review'>('open')
  const [codehubAuthor, setCodehubAuthor] = useState('')
  const [codehubAssignee, setCodehubAssignee] = useState('')
  if (codehubView === 'issues' && codehubState === 'merged') {
    setCodehubState('opened')
  }
  const nextModel = model as typeof model & {
    taskSourceManuallyChangedRef: typeof taskSourceManuallyChangedRef
    lastPageTaskSourceRef: typeof lastPageTaskSourceRef
    taskResumeAppliedRef: typeof taskResumeAppliedRef
    githubSearchPersistReadyRef: typeof githubSearchPersistReadyRef
    linearSearchPersistReadyRef: typeof linearSearchPersistReadyRef
    linearViewPersistReadyRef: typeof linearViewPersistReadyRef
    jiraSearchPersistReadyRef: typeof jiraSearchPersistReadyRef
    taskResumeApplied: typeof taskResumeApplied
    setTaskResumeApplied: typeof setTaskResumeApplied
    projectModeVisible: typeof projectModeVisible
    githubMode: typeof githubMode
    setGithubMode: typeof setGithubMode
    gitlabFilter: typeof gitlabFilter
    setGitlabFilter: typeof setGitlabFilter
    gitlabItems: typeof gitlabItems
    setGitlabItems: typeof setGitlabItems
    gitlabLoading: typeof gitlabLoading
    setGitlabLoading: typeof setGitlabLoading
    gitlabError: typeof gitlabError
    setGitlabError: typeof setGitlabError
    gitlabRefreshNonce: typeof gitlabRefreshNonce
    setGitlabRefreshNonce: typeof setGitlabRefreshNonce
    gitlabDialogItem: typeof gitlabDialogItem
    setGitlabDialogItem: typeof setGitlabDialogItem
    gitlabView: typeof gitlabView
    setGitlabView: typeof setGitlabView
    gitlabTodos: typeof gitlabTodos
    setGitlabTodos: typeof setGitlabTodos
    gitlabTodosLoading: typeof gitlabTodosLoading
    setGitlabTodosLoading: typeof setGitlabTodosLoading
    gitlabEmptyState: typeof gitlabEmptyState
    gitlabFilterIsValid: typeof gitlabFilterIsValid
    activeGitlabFilter: typeof activeGitlabFilter
    displayedGitLabItems: typeof displayedGitLabItems
    codehubView: typeof codehubView
    setCodehubView: typeof setCodehubView
    codehubState: typeof codehubState
    setCodehubState: typeof setCodehubState
    codehubItems: typeof codehubItems
    setCodehubItems: typeof setCodehubItems
    codehubLoading: typeof codehubLoading
    setCodehubLoading: typeof setCodehubLoading
    codehubError: typeof codehubError
    setCodehubError: typeof setCodehubError
    codehubRefreshNonce: typeof codehubRefreshNonce
    setCodehubRefreshNonce: typeof setCodehubRefreshNonce
    codehubDetailItem: typeof codehubDetailItem
    setCodehubDetailItem: typeof setCodehubDetailItem
    codehubQuery: typeof codehubQuery
    setCodehubQuery: typeof setCodehubQuery
    codehubPreset: typeof codehubPreset
    setCodehubPreset: typeof setCodehubPreset
    codehubAuthor: typeof codehubAuthor
    setCodehubAuthor: typeof setCodehubAuthor
    codehubAssignee: typeof codehubAssignee
    setCodehubAssignee: typeof setCodehubAssignee
  }
  nextModel.taskSourceManuallyChangedRef = taskSourceManuallyChangedRef
  nextModel.lastPageTaskSourceRef = lastPageTaskSourceRef
  nextModel.taskResumeAppliedRef = taskResumeAppliedRef
  nextModel.githubSearchPersistReadyRef = githubSearchPersistReadyRef
  nextModel.linearSearchPersistReadyRef = linearSearchPersistReadyRef
  nextModel.linearViewPersistReadyRef = linearViewPersistReadyRef
  nextModel.jiraSearchPersistReadyRef = jiraSearchPersistReadyRef
  nextModel.taskResumeApplied = taskResumeApplied
  nextModel.setTaskResumeApplied = setTaskResumeApplied
  nextModel.projectModeVisible = projectModeVisible
  nextModel.githubMode = githubMode
  nextModel.setGithubMode = setGithubMode
  nextModel.gitlabFilter = gitlabFilter
  nextModel.setGitlabFilter = setGitlabFilter
  nextModel.gitlabItems = gitlabItems
  nextModel.setGitlabItems = setGitlabItems
  nextModel.gitlabLoading = gitlabLoading
  nextModel.setGitlabLoading = setGitlabLoading
  nextModel.gitlabError = gitlabError
  nextModel.setGitlabError = setGitlabError
  nextModel.gitlabRefreshNonce = gitlabRefreshNonce
  nextModel.setGitlabRefreshNonce = setGitlabRefreshNonce
  nextModel.gitlabDialogItem = gitlabDialogItem
  nextModel.setGitlabDialogItem = setGitlabDialogItem
  nextModel.gitlabView = gitlabView
  nextModel.setGitlabView = setGitlabView
  nextModel.gitlabTodos = gitlabTodos
  nextModel.setGitlabTodos = setGitlabTodos
  nextModel.gitlabTodosLoading = gitlabTodosLoading
  nextModel.setGitlabTodosLoading = setGitlabTodosLoading
  nextModel.gitlabEmptyState = gitlabEmptyState
  nextModel.gitlabFilterIsValid = gitlabFilterIsValid
  nextModel.activeGitlabFilter = activeGitlabFilter
  nextModel.displayedGitLabItems = displayedGitLabItems
  nextModel.codehubView = codehubView
  nextModel.setCodehubView = setCodehubView
  nextModel.codehubState = codehubState
  nextModel.setCodehubState = setCodehubState
  nextModel.codehubItems = codehubItems
  nextModel.setCodehubItems = setCodehubItems
  nextModel.codehubLoading = codehubLoading
  nextModel.setCodehubLoading = setCodehubLoading
  nextModel.codehubError = codehubError
  nextModel.setCodehubError = setCodehubError
  nextModel.codehubRefreshNonce = codehubRefreshNonce
  nextModel.setCodehubRefreshNonce = setCodehubRefreshNonce
  nextModel.codehubDetailItem = codehubDetailItem
  nextModel.setCodehubDetailItem = setCodehubDetailItem
  nextModel.codehubQuery = codehubQuery
  nextModel.setCodehubQuery = setCodehubQuery
  nextModel.codehubPreset = codehubPreset
  nextModel.setCodehubPreset = setCodehubPreset
  nextModel.codehubAuthor = codehubAuthor
  nextModel.setCodehubAuthor = setCodehubAuthor
  nextModel.codehubAssignee = codehubAssignee
  nextModel.setCodehubAssignee = setCodehubAssignee
  return nextModel
}
export type TaskPageProviderStateModel = ReturnType<typeof useTaskPageProviderState>
