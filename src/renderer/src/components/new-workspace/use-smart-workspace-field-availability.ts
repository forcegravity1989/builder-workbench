import { useEffect, useMemo } from 'react'
import { filterAvailableTaskProviders } from '../../../../shared/task-providers'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { getMrStateFilters, getSmartWorkspaceNameModes } from './smart-workspace-localized-options'
import {
  SEARCH_DEBOUNCE_MS,
  type NormalizedSmartWorkspaceNameFieldProps
} from './smart-workspace-name-field-model'
import { canUseGitLabSmartSource } from './smart-workspace-provider-availability'
import { useSmartWorkspaceFieldFocusControls } from './use-smart-workspace-field-focus-controls'
import type { useSmartWorkspaceNameFieldState } from './use-smart-workspace-name-field-state'

type FieldState = ReturnType<typeof useSmartWorkspaceNameFieldState>

export function useSmartWorkspaceFieldAvailability({
  props,
  state,
  repoBackedSearchTargets,
  preflightStatus,
  preflightStatusChecked,
  preflightStatusContextKey,
  expectedPreflightContextKey,
  refreshPreflightStatus,
  linearStatus,
  linearStatusChecked,
  checkLinearConnection,
  jiraSourceConnected
}: {
  props: NormalizedSmartWorkspaceNameFieldProps
  state: FieldState
  repoBackedSearchTargets: {
    codehubSourceContext?: { hostId?: ExecutionHostId | null } | null
    githubSourceContext?: { hostId?: ExecutionHostId | null } | null
    gitlabSourceContext: { hostId?: ExecutionHostId | null } | null
  }[]
  preflightStatus: { glab?: { installed?: boolean } } | null
  preflightStatusChecked: boolean
  preflightStatusContextKey: string | null
  expectedPreflightContextKey: string
  refreshPreflightStatus: () => Promise<void>
  linearStatus: { connected?: boolean }
  linearStatusChecked: boolean
  checkLinearConnection: () => Promise<void>
  jiraSourceConnected: boolean
}) {
  const {
    disabled,
    textOnly,
    repoBackedSourcesDisabled,
    branchesEnabled,
    onActiveSourceModeChange,
    value
  } = props
  const {
    mode,
    setMode,
    setOpen,
    setGithubItems,
    setCodehubItems,
    setCodehubHasMore,
    setGitlabItems,
    setBranches,
    setGithubLoading,
    setCodehubLoading,
    setGitlabLoading,
    setBranchesLoading,
    setBranchResultsSource,
    setCrossRepoPrompt,
    setLinearIssues,
    setJiraIssues,
    setLinearLoading,
    setJiraLoading,
    setCommandValue,
    setDebouncedQuery
  } = state

  useEffect(() => {
    onActiveSourceModeChange?.(mode)
  }, [mode, onActiveSourceModeChange])
  const preflightStatusCurrent = preflightStatusContextKey === expectedPreflightContextKey
  const localGitlabAvailable = preflightStatusCurrent && preflightStatus?.glab?.installed === true
  const gitlabSourceAvailable = repoBackedSearchTargets.some((target) =>
    canUseGitLabSmartSource({
      localGitlabAvailable,
      repoBackedSourcesDisabled,
      sourceHostId: target.gitlabSourceContext?.hostId
    })
  )
  // Why: a CodeHub repo occupies the provider slot exactly like GitHub; only one
  // platform tab is shown so CodeHub work never queries GitHub (and vice versa).
  // Why: independent per-platform availability — a folder can hold GitHub and
  // CodeHub repos; unknown remotes count as neither and never query GitHub.
  const githubSourceAvailable = repoBackedSearchTargets.some((target) =>
    Boolean(target.githubSourceContext)
  )
  const codehubSourceAvailable = repoBackedSearchTargets.some((target) =>
    Boolean(target.codehubSourceContext)
  )
  const availableTaskProviders = useMemo(() => {
    const providers: ('github' | 'gitlab' | 'linear' | 'codehub')[] = []
    if (githubSourceAvailable) {
      providers.push('github')
    }
    providers.push('gitlab', 'linear')
    if (codehubSourceAvailable) {
      providers.push('codehub')
    }
    return filterAvailableTaskProviders(providers, {
      gitlabInstalled: gitlabSourceAvailable,
      linearConnected: linearStatus.connected === true
    })
  }, [codehubSourceAvailable, githubSourceAvailable, gitlabSourceAvailable, linearStatus.connected])
  const linearAvailable = availableTaskProviders.includes('linear')
  const availableModes = getSmartWorkspaceNameModes().filter((item) => {
    if (textOnly) {
      return item.id === 'text'
    }
    if (item.id === 'github') {
      return !repoBackedSourcesDisabled && githubSourceAvailable
    }
    if (item.id === 'codehub') {
      return !repoBackedSourcesDisabled && codehubSourceAvailable
    }
    if (item.id === 'gitlab') {
      return gitlabSourceAvailable
    }
    if (item.id === 'linear') {
      return linearAvailable
    }
    if (item.id === 'jira') {
      return jiraSourceConnected
    }
    if (item.id === 'branches') {
      return branchesEnabled && !repoBackedSourcesDisabled
    }
    return true
  })
  const mrStateFilters = getMrStateFilters()

  useEffect(() => {
    if (availableModes.some((item) => item.id === mode)) {
      return
    }
    setMode(availableModes[0]?.id ?? 'text')
  }, [availableModes, mode, setMode])

  useEffect(() => {
    if (!repoBackedSourcesDisabled) {
      return
    }
    setGithubItems([])
    setCodehubItems([])
    setCodehubHasMore(false)
    setGitlabItems([])
    setBranches([])
    setGithubLoading(false)
    setCodehubLoading(false)
    setGitlabLoading(false)
    setBranchesLoading(false)
    setBranchResultsSource(null)
    setCrossRepoPrompt(null)
  }, [
    repoBackedSourcesDisabled,
    setBranches,
    setBranchesLoading,
    setBranchResultsSource,
    setCodehubHasMore,
    setCodehubItems,
    setCodehubLoading,
    setCrossRepoPrompt,
    setGithubItems,
    setGithubLoading,
    setGitlabItems,
    setGitlabLoading
  ])

  const focusControls = useSmartWorkspaceFieldFocusControls({ props, state })

  useEffect(() => {
    if (disabled || textOnly) {
      return
    }
    if (!preflightStatusChecked || !preflightStatusCurrent) {
      void refreshPreflightStatus()
    }
    if (!linearStatusChecked) {
      void checkLinearConnection()
    }
  }, [
    checkLinearConnection,
    disabled,
    linearStatusChecked,
    preflightStatusChecked,
    preflightStatusCurrent,
    refreshPreflightStatus,
    textOnly
  ])

  useEffect(() => {
    if (textOnly) {
      if (mode !== 'text') {
        setMode('text')
      }
      setOpen(false)
      return
    }
    if ((mode === 'gitlab' && gitlabSourceAvailable) || (mode === 'linear' && linearAvailable)) {
      return
    }
    if (mode !== 'gitlab' && mode !== 'linear') {
      return
    }
    setMode('smart')
    setGitlabItems([])
    setLinearIssues([])
    setJiraIssues([])
    setGitlabLoading(false)
    setLinearLoading(false)
    setJiraLoading(false)
    setCommandValue('')
  }, [
    gitlabSourceAvailable,
    linearAvailable,
    mode,
    setCommandValue,
    setGitlabItems,
    setGitlabLoading,
    setJiraIssues,
    setJiraLoading,
    setLinearIssues,
    setLinearLoading,
    setMode,
    setOpen,
    textOnly
  ])

  useEffect(() => {
    if (!disabled) {
      return
    }
    setOpen(false)
    setGithubItems([])
    setCodehubItems([])
    setCodehubHasMore(false)
    setGitlabItems([])
    setBranches([])
    setBranchResultsSource(null)
    setLinearIssues([])
    setJiraIssues([])
    setGithubLoading(false)
    setCodehubLoading(false)
    setGitlabLoading(false)
    setBranchesLoading(false)
    setLinearLoading(false)
    setJiraLoading(false)
    setCommandValue('')
    setCrossRepoPrompt(null)
  }, [
    disabled,
    setBranches,
    setBranchesLoading,
    setBranchResultsSource,
    setCodehubHasMore,
    setCodehubItems,
    setCodehubLoading,
    setCommandValue,
    setCrossRepoPrompt,
    setGithubItems,
    setGithubLoading,
    setGitlabItems,
    setGitlabLoading,
    setJiraIssues,
    setJiraLoading,
    setLinearIssues,
    setLinearLoading,
    setOpen
  ])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(value), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [setDebouncedQuery, value])

  return {
    codehubSourceAvailable,
    githubSourceAvailable,
    gitlabSourceAvailable,
    linearAvailable,
    availableModes,
    mrStateFilters,
    ...focusControls
  }
}
