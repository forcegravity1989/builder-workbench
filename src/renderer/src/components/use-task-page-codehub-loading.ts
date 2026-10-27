import { codehubApi } from '@/lib/codehub-api'
import type { TaskPageGitLabLoadingModel } from './use-task-page-gitlab-loading'
import { useEffect } from 'react'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'

const CODEHUB_LIST_LIMIT = 250

export function useTaskPageCodeHubLoading(model: TaskPageGitLabLoadingModel) {
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
  useEffect(() => {
    if (taskSource !== 'codehub') {
      return
    }
    // Why: a BW workbench scope materializes its own reference-driven CodeHub
    // rows; the unscoped full-list fetch must not overwrite them.
    if (workbenchTaskScope?.goalId) {
      return
    }
    if (workbenchTaskScope) {
      setCodehubItems([])
      setCodehubLoading(false)
      setCodehubError('CodeHub 版本筛选暂不可用，移除版本筛选可查看项目任务。')
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
          scope,
          search: serverQuery || undefined,
          author: serverAuthor || undefined,
          assignee: serverAssignee || undefined
        })
        return listed.items.map((item) => ({
          ...item,
          repoId: repo.id,
          repoPath: repo.path,
          host: listed.remote.host,
          project: listed.remote.project
        }))
      })
    )
      .then((results) => {
        if (stale) {
          return
        }
        const items: CodeHubTaskItem[] = []
        const errors: string[] = []
        for (const result of results) {
          if (result.status !== 'fulfilled') {
            errors.push(
              result.reason instanceof Error ? result.reason.message : String(result.reason)
            )
            continue
          }
          items.push(...result.value)
        }
        setCodehubItems(items)
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
  return model
}

export type TaskPageCodeHubLoadingModel = ReturnType<typeof useTaskPageCodeHubLoading>
