import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import { withQualifier } from '../../../shared/task-query'
import {
  matchesWorkbenchTaskQuery,
  hasUnsupportedWorkbenchTaskSearch,
  seedWorkbenchTaskQuery,
  type WorkbenchTaskScope
} from '../../../shared/workbench/task-scope'
import type { TaskScopeLoadResult, TaskScopeMissingRow } from './task-scope-load'

export type WorkbenchTaskScopeModelFields = {
  workbenchScopeActive: boolean
  workbenchScope: WorkbenchTaskScope | null
  workbenchScopeLoading: boolean
  workbenchScopeError: string | null
  workbenchScopeMissing: TaskScopeMissingRow[]
  workbenchScopeReadyCount: number
  workbenchScopeViewProvider: 'github' | 'codehub' | null
  workbenchScopeItemKeys: Set<string>
  workbenchScopeCodeHubItemKeys: Set<string>
  workbenchScopeViewerLogins: ReadonlyMap<string, string>
  clearWorkbenchVersion: () => void
  clearWorkbenchProject: () => void
  clearWorkbenchGoal: () => void
}

export function workbenchTaskScopeItemKeys(result: TaskScopeLoadResult | null) {
  return {
    github: new Set((result?.githubItems ?? []).map((item) => `${item.repoId}:${item.number}`)),
    codehub: new Set((result?.codehubItems ?? []).map((item) => `${item.repoId}:${item.iid}`))
  }
}

export function resolveWorkbenchTaskScopeFilters({
  active,
  taskSource,
  githubQuery,
  viewerError
}: {
  active: boolean
  taskSource: string
  githubQuery: string
  viewerError: string | null
}) {
  const filterProblem =
    active && taskSource === 'github' && hasUnsupportedWorkbenchTaskSearch(githubQuery)
      ? '此高级搜索暂不能与目标筛选同时使用，请移除目标筛选后重试。'
      : active
        ? viewerError
        : null
  return { filterProblem }
}

export function buildCodeHubGoalQuery(
  model: { codehubState: string; codehubAuthor: string; codehubAssignee: string },
  scope: WorkbenchTaskScope | null
): string {
  let query = withQualifier(
    '',
    'state',
    model.codehubState === 'opened' ? 'open' : model.codehubState
  )
  query = withQualifier(query, 'author', model.codehubAuthor.trim() || null)
  query = withQualifier(query, 'assignee', model.codehubAssignee.trim() || null)
  return seedWorkbenchTaskQuery(query, scope)
}

/** Apply native criteria to the complete goal reference set before paging. */
export function projectWorkbenchTaskScope({
  result,
  selectedRepoIds,
  githubIssueView,
  githubQuery,
  viewerLogins,
  githubPageSize,
  codehubIssueView,
  codehubQuery,
  codehubPreset,
  blocked
}: {
  result: TaskScopeLoadResult
  selectedRepoIds: ReadonlySet<string>
  githubIssueView: boolean
  githubQuery: string
  viewerLogins: ReadonlyMap<string, string>
  githubPageSize: number
  codehubIssueView: boolean
  codehubQuery: string
  codehubPreset: string
  blocked: boolean
}) {
  const githubItems =
    !githubIssueView || blocked
      ? []
      : result.githubItems.filter(
          (item) =>
            selectedRepoIds.has(item.repoId) &&
            matchesWorkbenchTaskQuery(
              { ...item, assignees: (item.assignees ?? []).map((user) => user.login) },
              githubQuery,
              viewerLogins.get(item.repoId) ?? null
            )
        )
  const githubPages: GitHubWorkItem[][] = []
  const size = Math.max(1, githubPageSize)
  for (let start = 0; start < githubItems.length; start += size) {
    githubPages.push(githubItems.slice(start, start + size))
  }
  const codehubItems =
    !codehubIssueView || blocked
      ? []
      : result.codehubItems.filter((item) => {
          if (!item.repoId || !selectedRepoIds.has(item.repoId)) {
            return false
          }
          const login = viewerLogins.get(item.repoId) ?? null
          const input = {
            number: item.iid,
            title: item.title,
            state: item.state === 'opened' ? 'open' : item.state,
            labels: item.labels ?? [],
            author: item.author,
            assignees: item.assignees
          }
          return (
            matchesWorkbenchTaskQuery(input, codehubQuery, login) &&
            (codehubPreset !== 'mine' || matchesWorkbenchTaskQuery(input, 'assignee:@me', login))
          )
        })
  return { githubPages: githubPages.length ? githubPages : [[]], codehubItems }
}
