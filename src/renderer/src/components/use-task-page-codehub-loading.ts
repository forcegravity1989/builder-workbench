import { codehubApi } from '@/lib/codehub-api'
import type { TaskPageGitLabLoadingModel } from './use-task-page-gitlab-loading'
import { useEffect, useState } from 'react'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import { workbenchVersionTaskLabel } from '../../../shared/workbench/task-scope'

const CODEHUB_LIST_LIMIT = 250
// Why: 空数组必须是稳定引用，否则非 MR 视图下 effect 依赖每次渲染都变。
const NO_SERVER_LABELS: string[] = []

export function useTaskPageCodeHubLoading(model: TaskPageGitLabLoadingModel) {
  const [codehubHasMore, setCodehubHasMore] = useState(false)
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
    // Why: a BW workbench scope materializes its own reference-driven CodeHub
    // rows; the unscoped full-list fetch must not overwrite them.
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
        const listed = await codehubApi.listTasks({
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
            project: listed.remote.project
          }))
        }
      })
    )
      .then((results) => {
        if (stale) {
          return
        }
        const items: CodeHubTaskItem[] = []
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
  const nextModel = model as typeof model & { codehubHasMore: boolean }
  nextModel.codehubHasMore = codehubHasMore
  return nextModel
}

export type TaskPageCodeHubLoadingModel = ReturnType<typeof useTaskPageCodeHubLoading>
