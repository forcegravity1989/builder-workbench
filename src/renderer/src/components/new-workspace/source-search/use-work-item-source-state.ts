import { useGitHubTaskItems } from '@/lib/work-items/github/useGitHubTaskItems'
import { useRef, useState } from 'react'
import type { CodeHubTaskItem } from '../../../../../shared/codehub-tasks'
import type { RepoSlug } from '../../../../../shared/github/repositories/links'
import type { GitHubWorkItem } from '../../../../../shared/github/work-items/work-item-types'
import type { GitLabWorkItem } from '../../../../../shared/gitlab/gitlab-types'
import type { JiraIssue } from '../../../../../shared/jira/jira-types'
import type { BaseRefSearchResult } from '../../../../../shared/repository/repo-types'
import type { SmartNameMode } from '../../../../../shared/new-workspace/smart-workspace-source-results'
import type { MrStateFilter } from './smart-workspace-localized-options'
import type { CrossRepoPrompt } from '../name-field/smart-workspace-name-field-model'

export function useWorkItemSourceState(textOnly: boolean, value: string) {
  const [mode, setMode] = useState<SmartNameMode>(textOnly ? 'text' : 'smart')
  const [mrStateFilter, setMrStateFilter] = useState<MrStateFilter>('opened')
  const [debouncedQuery, setDebouncedQuery] = useState(value)
  const [rawGithubItems, setGithubItems] = useState<GitHubWorkItem[]>([])
  const githubItems = useGitHubTaskItems(rawGithubItems)
  const [codehubItems, setCodehubItems] = useState<CodeHubTaskItem[]>([])
  const [codehubHasMore, setCodehubHasMore] = useState(false)
  const [codehubError, setCodehubError] = useState<string | null>(null)
  const [codehubLoading, setCodehubLoading] = useState(false)
  const [codehubRefreshNonce, setCodehubRefreshNonce] = useState(0)
  const [gitlabItems, setGitlabItems] = useState<GitLabWorkItem[]>([])
  const [branches, setBranches] = useState<BaseRefSearchResult[]>([])
  const [branchResultsSource, setBranchResultsSource] = useState<{
    repoId: string
    query: string
  } | null>(null)
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([])
  const [githubLoading, setGithubLoading] = useState(false)
  const [gitlabLoading, setGitlabLoading] = useState(false)
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [linearUrlLoadingFeedbackQuery, setLinearUrlLoadingFeedbackQuery] = useState<string | null>(
    null
  )
  const [jiraLoading, setJiraLoading] = useState(false)
  const [commandValue, setCommandValue] = useState('')
  const repoSlugCacheRef = useRef<Map<string, RepoSlug>>(new Map())
  const handledCrossRepoUrlRef = useRef<string | null>(null)
  const [crossRepoPrompt, setCrossRepoPrompt] = useState<CrossRepoPrompt | null>(null)

  return {
    mode,
    setMode,
    mrStateFilter,
    setMrStateFilter,
    debouncedQuery,
    setDebouncedQuery,
    githubItems,
    setGithubItems,
    codehubItems,
    setCodehubItems,
    codehubHasMore,
    setCodehubHasMore,
    codehubError,
    setCodehubError,
    codehubLoading,
    setCodehubLoading,
    codehubRefreshNonce,
    setCodehubRefreshNonce,
    gitlabItems,
    setGitlabItems,
    branches,
    setBranches,
    branchResultsSource,
    setBranchResultsSource,
    jiraIssues,
    setJiraIssues,
    githubLoading,
    setGithubLoading,
    gitlabLoading,
    setGitlabLoading,
    branchesLoading,
    setBranchesLoading,
    linearUrlLoadingFeedbackQuery,
    setLinearUrlLoadingFeedbackQuery,
    jiraLoading,
    setJiraLoading,
    commandValue,
    setCommandValue,
    repoSlugCacheRef,
    handledCrossRepoUrlRef,
    crossRepoPrompt,
    setCrossRepoPrompt
  }
}
