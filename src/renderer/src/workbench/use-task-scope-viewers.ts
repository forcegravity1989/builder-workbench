import { useEffect, useState } from 'react'
import type { Repo } from '../../../shared/repository/repo-types'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import type { WorkbenchTaskScope } from '../../../shared/workbench/task-scope'
import { parseTaskQuery } from '../../../shared/work-items/task-query'
import { getRepoExecutionHostId } from '../../../shared/execution-host/execution-host'
import { createTaskPageCodeHubApi } from '@/lib/codehub-api'
import { getTaskPageGitHubItemSource, lookupGitHubViewerForSource } from './task-source-context'
import { taskScopeGitHubViewerKey } from './task-scope-projection'
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
  selectedScopeRepoIds: ReadonlySet<string>
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
        [...query.authors, query.assignee].some((value) => value?.toLowerCase() === '@me')
  const requests = new Map<
    string,
    {
      repoId: string
      source?: ReturnType<typeof getTaskPageGitHubItemSource>
      codehub?: Pick<CodeHubTaskItem, 'repoPath' | 'host' | 'project'>
    }
  >()
  if (active && needsViewer) {
    for (const item of model.taskSource === 'codehub'
      ? (result?.codehubItems ?? [])
      : (result?.githubItems ?? [])) {
      if (!item.repoId || !model.selectedScopeRepoIds.has(item.repoId)) {
        continue
      }
      if (item.type === 'pr' || 'number' in item) {
        const repo = model.repoMap.get(item.repoId)
        requests.set(taskScopeGitHubViewerKey(item), {
          repoId: item.repoId,
          source: getTaskPageGitHubItemSource(repo, item)
        })
      } else {
        requests.set(item.repoId, {
          repoId: item.repoId,
          codehub: { repoPath: item.repoPath, host: item.host, project: item.project }
        })
      }
    }
  }
  const requestKey = requests.size
    ? JSON.stringify([
        model.taskSource,
        model.pageData.workbenchTaskScope?.version,
        model.pageData.workbenchTaskScope?.goalId,
        [...requests]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, request]) => {
            const id = request.repoId
            const repo = model.repoMap.get(id)
            return [
              key,
              request.source?.providerIdentity,
              request.codehub,
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
      [...requests].map(async ([key, request]) => {
        const repo = model.repoMap.get(request.repoId)
        const repoPath = request.codehub ? request.codehub.repoPath : repo?.path
        if (!repoPath) {
          throw new Error('Repository is unavailable')
        }
        const args = { repoId: request.repoId, repoPath }
        const login =
          model.taskSource === 'codehub'
            ? (await createTaskPageCodeHubApi(null, request.codehub).viewer(args)).username
            : (
                await lookupGitHubViewerForSource({
                  ...args,
                  sourceContext: request.source
                })
              )?.login
        if (!login) {
          throw new Error('Current user is unavailable')
        }
        return [key, login] as const
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
        error: failed ? '无法核对本机账号，请登录后刷新、指定用户名或移除目标筛选。' : null
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
