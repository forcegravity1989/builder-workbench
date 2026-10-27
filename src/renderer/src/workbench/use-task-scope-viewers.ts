import { useEffect, useState } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { WorkbenchTaskScope } from '../../../shared/workbench/task-scope'
import { parseTaskQuery } from '../../../shared/task-query'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { codehubApi } from '@/lib/codehub-api'
import { lookupGitHubViewerForSource } from '@/lib/github-work-item-source-lookup'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import type { TaskScopeLoadResult } from './task-scope-load'
import { useAppStore } from '@/store'

type ViewerModel = {
  pageData: { workbenchTaskScope?: WorkbenchTaskScope | null }
  taskSource: string
  appliedTaskSearch: string
  codehubPreset: string
  codehubAuthor: string
  codehubAssignee: string
  repoMap: ReadonlyMap<string, Repo>
  repoSelection: ReadonlySet<string>
  taskRefreshNonce: number
  codehubRefreshNonce: number
  workItemsInvalidationNonce: number
}
const EMPTY_LOGINS: ReadonlyMap<string, string> = new Map()

/** Identities are ephemeral, repo-owned reads, requested only for a goal's @me filter. */
export function useTaskScopeViewers(
  model: ViewerModel,
  result: TaskScopeLoadResult | null,
  active: boolean
) {
  const projects = useAppStore((state) => state.projects)
  const runtimeDefault = useAppStore((state) => state.settings?.localWindowsRuntimeDefault)
  const query = parseTaskQuery(model.appliedTaskSearch)
  const needsViewer =
    model.taskSource === 'codehub'
      ? model.codehubPreset === 'mine' ||
        [model.codehubAuthor, model.codehubAssignee].some(
          (value) => value.trim().toLowerCase() === '@me'
        )
      : model.taskSource === 'github' &&
        [query.author, query.assignee].some((value) => value?.toLowerCase() === '@me')
  const items = model.taskSource === 'codehub' ? result?.codehubItems : result?.githubItems
  const ids = [
    ...new Set(
      (items ?? [])
        .map((item) => item.repoId)
        .filter((id): id is string => !!id && model.repoSelection.has(id))
    )
  ].sort()
  const requestKey =
    active && needsViewer && ids.length
      ? JSON.stringify([
          model.taskSource,
          model.pageData.workbenchTaskScope?.version,
          model.pageData.workbenchTaskScope?.goalId,
          ids.map((id) => {
            const repo = model.repoMap.get(id)
            return [
              id,
              repo && getRepoExecutionHostId(repo),
              repo?.path,
              repo?.gitRemoteIdentity,
              repo?.issueSourcePreference,
              projects.find((project) => project.sourceRepoIds.includes(id))
                ?.localWindowsRuntimePreference
            ]
          }),
          runtimeDefault,
          model.taskRefreshNonce,
          model.codehubRefreshNonce,
          model.workItemsInvalidationNonce
        ])
      : null
  const [state, setState] = useState<{
    key: string
    logins: ReadonlyMap<string, string>
    error: string | null
  } | null>(null)
  useEffect(() => {
    setState(null)
    if (!requestKey) {
      return
    }
    let stale = false
    void Promise.allSettled(
      ids.map(async (id) => {
        const repo = model.repoMap.get(id)
        if (!repo) {
          throw new Error('Repository is unavailable')
        }
        const args = { repoId: repo.id, repoPath: repo.path }
        const login =
          model.taskSource === 'codehub'
            ? (await codehubApi.viewer(args)).username
            : (
                await lookupGitHubViewerForSource({
                  ...args,
                  sourceContext: getTaskPageRepoSourceContext(repo, 'github')
                })
              )?.login
        if (!login) {
          throw new Error('Current user is unavailable')
        }
        return [id, login] as const
      })
    ).then((results) => {
      if (stale) {
        return
      }
      const logins = new Map<string, string>()
      let failed = false
      for (const entry of results) {
        if (entry.status === 'fulfilled') {
          logins.set(...entry.value)
        } else {
          failed = true
        }
      }
      setState({
        key: requestKey,
        logins,
        error: failed
          ? '无法核对部分项目所属宿主的当前用户，请登录后刷新、指定用户名或移除目标筛选。'
          : null
      })
    })
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])
  const current = state?.key === requestKey ? state : null
  return {
    logins: current?.logins ?? EMPTY_LOGINS,
    loading: requestKey !== null && !current,
    error: current?.error ?? null
  }
}
