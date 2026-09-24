import { codehubApi } from '@/lib/codehub-api'
import type { TaskPageGitLabLoadingModel } from './use-task-page-gitlab-loading'
import { useEffect, useState } from 'react'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'

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
  const scopeKey = JSON.stringify([
    selectedRepos.map((repo) => [repo.id, repo.path, repo.executionHostId, repo.gitRemoteIdentity]),
    codehubView,
    codehubState,
    codehubPreset,
    codehubQuery,
    codehubAuthor,
    codehubAssignee
  ])
  const [page, setPage] = useState({ scopeKey, limit: 30 })
  const limit = page.scopeKey === scopeKey ? page.limit : 30
  const loadKey = `${scopeKey}:${limit}`
  const [more, setMore] = useState({ loadKey: '', hasMore: false })
  useEffect(() => {
    if (taskSource !== 'codehub') {
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
          limit,
          scope,
          search: kind === 'mr' ? codehubQuery : undefined,
          author: kind === 'mr' ? codehubAuthor : undefined,
          assignee: kind === 'mr' ? codehubAssignee : undefined
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
        setCodehubError(errors[0] ?? null)
        setMore({ loadKey, hasMore })
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
    limit,
    loadKey,
    codehubAssignee,
    codehubAuthor,
    codehubPreset,
    codehubQuery,
    codehubRefreshNonce,
    codehubState,
    codehubView,
    selectedRepos,
    setCodehubError,
    setCodehubItems,
    setCodehubLoading,
    taskSource
  ])
  return {
    ...model,
    codehubHasMore: more.loadKey === loadKey && more.hasMore,
    loadMoreCodehub: () => setPage({ scopeKey, limit: limit + 30 })
  }
}

export type TaskPageCodeHubLoadingModel = ReturnType<typeof useTaskPageCodeHubLoading>
