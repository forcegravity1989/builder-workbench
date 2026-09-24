import type { TaskPageGitLabLoadingModel } from './use-task-page-gitlab-loading'
import { useEffect } from 'react'
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
        const listed = await window.api.codehub.listTasks({
          repoPath: repo.path,
          repoId: repo.id,
          kind,
          state,
          limit: 30,
          scope,
          search: kind === 'mr' ? codehubQuery : undefined,
          author: kind === 'mr' ? codehubAuthor : undefined,
          assignee: kind === 'mr' ? codehubAssignee : undefined
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
  return model
}

export type TaskPageCodeHubLoadingModel = ReturnType<typeof useTaskPageCodeHubLoading>
