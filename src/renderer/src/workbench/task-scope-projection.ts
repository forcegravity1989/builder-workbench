import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { parseTaskQuery } from '../../../shared/task-query'
import {
  matchesWorkbenchTaskQuery,
  hasUnsupportedWorkbenchTaskSearch,
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
  result,
  repoMap,
  homeHostId,
  taskSource,
  githubQuery,
  githubViewerLogin,
  codehubPreset,
  codehubAuthor,
  codehubAssignee
}: {
  active: boolean
  result: TaskScopeLoadResult | null
  repoMap: ReadonlyMap<string, Repo>
  homeHostId: ExecutionHostId | undefined
  taskSource: string
  githubQuery: string
  githubViewerLogin: string | null
  codehubPreset: string
  codehubAuthor: string
  codehubAssignee: string
}) {
  const query = parseTaskQuery(githubQuery)
  const needsViewer = [query.author, query.assignee].some((value) => value?.toLowerCase() === '@me')
  const hostedGoal =
    result?.githubItems.some((item) => {
      const repo = repoMap.get(item.repoId)
      return !repo || getRepoExecutionHostId(repo) !== 'local'
    }) ?? homeHostId !== 'local'
  const viewerLogin = hostedGoal ? null : githubViewerLogin
  const filterProblem =
    active && taskSource === 'github' && hasUnsupportedWorkbenchTaskSearch(githubQuery)
      ? '此高级搜索暂不能与目标筛选同时使用，请移除目标筛选后重试。'
      : active &&
          taskSource === 'codehub' &&
          (codehubPreset === 'mine' ||
            [codehubAuthor, codehubAssignee].some((value) => value.toLowerCase() === '@me'))
        ? 'CodeHub 目标范围暂无法核对当前登录用户，请切换到开放后指定作者或经办人。'
        : active && taskSource === 'github' && !viewerLogin && needsViewer
          ? '暂无法核对当前宿主的 GitHub 用户，请指定用户或移除目标筛选。'
          : null
  return { githubViewerLogin: viewerLogin, filterProblem }
}

/** Apply native criteria to the complete goal reference set before paging. */
export function projectWorkbenchTaskScope({
  result,
  selectedRepoIds,
  githubIssueView,
  githubQuery,
  githubViewerLogin,
  githubPageSize,
  codehubIssueView,
  codehubQuery,
  blocked
}: {
  result: TaskScopeLoadResult
  selectedRepoIds: ReadonlySet<string>
  githubIssueView: boolean
  githubQuery: string
  githubViewerLogin: string | null
  githubPageSize: number
  codehubIssueView: boolean
  codehubQuery: string
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
              githubViewerLogin
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
      : result.codehubItems.filter(
          (item) =>
            !!item.repoId &&
            selectedRepoIds.has(item.repoId) &&
            matchesWorkbenchTaskQuery(
              {
                number: item.iid,
                title: item.title,
                state: item.state === 'opened' ? 'open' : item.state,
                labels: item.labels ?? [],
                author: item.author,
                assignees: item.assignees
              },
              codehubQuery,
              null
            )
        )
  return { githubPages: githubPages.length ? githubPages : [[]], codehubItems }
}
