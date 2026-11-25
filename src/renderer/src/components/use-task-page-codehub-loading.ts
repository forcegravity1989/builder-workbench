import { createTaskPageCodeHubApi, getCodeHubRepoSourceContext } from '@/lib/codehub-api'
import type { Repo } from '../../../shared/repository/repo-types'
import type { CodeHubListTasksArgs } from '../../../shared/codehub-api'
import { useEffect, useState } from 'react'
import { useTaskPageCodeHubGoalScope } from './use-task-page-codehub-goal-scope'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import type { TaskSourceContext } from '../../../shared/work-items/task-source-context'
import {
  type WorkbenchTaskScope,
  workbenchVersionTaskLabel
} from '../../../shared/workbench/task-scope'

const CODEHUB_LIST_LIMIT = 250
// Why: 空数组必须是稳定引用，否则非 MR 视图下 effect 依赖每次渲染都变。
const NO_SERVER_LABELS: string[] = []

export type CodeHubTaskRow = CodeHubTaskItem & { sourceContext?: TaskSourceContext | null }

export type CodeHubLoadingInput = {
  scopeRepoId?: string
  selectedRepos: readonly Repo[]
  taskSource: string
  codehubView: 'issues' | 'mrs'
  codehubState: CodeHubListTasksArgs['state']
  codehubPreset: string
  codehubQuery: string
  codehubAuthor: string
  codehubAssignee: string
  codehubLabels: string[]
  codehubRefreshNonce: number
  setCodehubItems: (items: CodeHubTaskRow[]) => void
  setCodehubLoading: (loading: boolean) => void
  setCodehubError: (error: string | null) => void
  pageData: { workbenchTaskScope?: WorkbenchTaskScope | null }
}

export function useTaskPageCodeHubLoading<Model extends CodeHubLoadingInput>(model: Model) {
  const [codehubHasMore, setCodehubHasMore] = useState(false)
  const goalScope = useTaskPageCodeHubGoalScope(model)
  const {
    selectedRepos,
    taskSource,
    codehubView,
    codehubState,
    codehubPreset,
    codehubQuery,
    codehubAuthor,
    codehubAssignee,
    codehubRefreshNonce,
    setCodehubItems,
    setCodehubLoading,
    setCodehubError
  } = model
  const workbenchTaskScope = model.pageData.workbenchTaskScope
  const serverQuery = codehubView === 'mrs' ? codehubQuery : ''
  const serverAuthor = codehubView === 'mrs' ? codehubAuthor : ''
  const serverAssignee = codehubView === 'mrs' ? codehubAssignee : ''
  const serverLabels = codehubView === 'mrs' ? model.codehubLabels : NO_SERVER_LABELS
  useEffect(() => {
    if (taskSource !== 'codehub') {
      return
    }
    setCodehubHasMore(false)
    if (workbenchTaskScope?.goalId) {
      return
    }
    const repos = selectedRepos.filter((repo) => isCodeHubGitRemote(repo.gitRemoteIdentity))
    if (repos.length === 0) {
      setCodehubItems([])
      setCodehubLoading(false)
      setCodehubError(null)
      return
    }
    const state = codehubView === 'issues' && codehubState === 'merged' ? 'opened' : codehubState
    let stale = false
    setCodehubLoading(true)
    setCodehubError(null)
    void Promise.allSettled(
      repos.map(async (repo) => {
        const kind = codehubView === 'mrs' ? 'mr' : 'issue'
        const scope =
          codehubPreset === 'mine'
            ? kind === 'issue'
              ? 'assigned_to_me'
              : 'created_by_me'
            : codehubPreset === 'review' && kind === 'mr'
              ? 'need_my_review'
              : undefined
        // 宿主用于识别登记行，任务数据仍按任务页的本机账号策略读取。
        const sourceContext = getCodeHubRepoSourceContext(repo)
        const api = createTaskPageCodeHubApi(sourceContext)
        const listed = await api.listTasks({
          repoPath: repo.path,
          repoId: repo.id,
          kind,
          state,
          limit: CODEHUB_LIST_LIMIT,
          labels: workbenchTaskScope
            ? [...new Set([workbenchVersionTaskLabel(workbenchTaskScope.version), ...serverLabels])]
            : serverLabels.length > 0
              ? serverLabels
              : undefined,
          scope,
          search: serverQuery || undefined,
          author: serverAuthor || undefined,
          assignee: serverAssignee || undefined
        })
        return {
          hasMore: listed.hasMore,
          items: listed.items.map((item) => ({
            ...item,
            repoId: repo.id,
            repoPath: repo.path,
            host: listed.remote.host,
            project: listed.remote.project,
            sourceContext
          }))
        }
      })
    )
      .then((results) => {
        if (stale) {
          return
        }
        const items: CodeHubTaskRow[] = []
        const errors: string[] = []
        let hasMore = false
        for (const result of results) {
          if (result.status !== 'fulfilled') {
            errors.push(
              result.reason instanceof Error ? result.reason.message : String(result.reason)
            )
            continue
          }
          items.push(...result.value.items)
          hasMore ||= result.value.hasMore
        }
        setCodehubItems(items)
        setCodehubHasMore(hasMore)
        setCodehubError(errors[0] ?? null)
      })
      .finally(() => {
        if (!stale) {
          setCodehubLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [
    serverAssignee,
    serverAuthor,
    serverLabels,
    serverQuery,
    codehubPreset,
    codehubRefreshNonce,
    codehubState,
    codehubView,
    selectedRepos,
    setCodehubError,
    setCodehubItems,
    setCodehubLoading,
    taskSource,
    workbenchTaskScope
  ])
  return {
    ...model,
    codehubHasMore,
    codehubScopeMissing: goalScope.missing,
    codehubScopeReadyCount: goalScope.readyCount
  }
}

export type TaskPageCodeHubLoadingModel = ReturnType<typeof useTaskPageCodeHubLoading>
