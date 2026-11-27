import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  cachedWorkbenchTaskScope,
  loadWorkbenchTaskScope,
  requireVersionTaskScopeHome,
  type TaskScopeLoadResult
} from '@/workbench/task-scope-load'
import { nativeTaskReferenceReader } from '@/workbench/native-task-port'
import { buildCodeHubGoalQuery, projectWorkbenchTaskScope } from '@/workbench/task-scope-projection'
import { useTaskScopeViewers } from '@/workbench/use-task-scope-viewers'
import { workbenchTaskScopeKey } from '../../../shared/workbench/task-scope'
import type { CodeHubLoadingInput } from './use-task-page-codehub-loading'

export function useTaskPageCodeHubGoalScope(model: CodeHubLoadingInput) {
  const scope = model.pageData.workbenchTaskScope
  const goal = scope?.goalId ? scope : null
  const active = !!goal && model.taskSource === 'codehub' && model.codehubView === 'issues'
  const repos = useAppStore((state) => state.repos)
  const activeRepoId = useAppStore((state) => state.activeRepoId)
  const home = useMemo(() => {
    if (!goal) {
      return null
    }
    try {
      return requireVersionTaskScopeHome(
        model.scopeRepoId,
        { repos, activeRepoId },
        goal.homeHostId,
        goal.runtimeOwnerEnvironmentId
      )
    } catch {
      return null
    }
  }, [goal, model.scopeRepoId, repos, activeRepoId])
  const key =
    goal && home
      ? JSON.stringify([
          workbenchTaskScopeKey(goal),
          nativeTaskReferenceReader.key(home, goal.references)
        ])
      : null
  const cached = useMemo(
    () => (goal && home ? cachedWorkbenchTaskScope(goal, home) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  )
  const [loaded, setLoaded] = useState<{ key: string; result: TaskScopeLoadResult } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastRequest = useRef({ key, nonce: model.codehubRefreshNonce })
  const result = loaded?.key === key ? loaded.result : cached

  useEffect(() => {
    if (!active || !goal) {
      setLoading(false)
      return
    }
    let cancelled = false
    const force =
      lastRequest.current.key === key && lastRequest.current.nonce !== model.codehubRefreshNonce
    lastRequest.current = { key, nonce: model.codehubRefreshNonce }
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const target =
          home ??
          requireVersionTaskScopeHome(
            model.scopeRepoId,
            undefined,
            goal.homeHostId,
            goal.runtimeOwnerEnvironmentId
          )
        const result = await loadWorkbenchTaskScope(goal, target, force)
        if (!cancelled && key) {
          setLoaded({ key, result })
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, model.codehubRefreshNonce])

  const selectedRepoIds = useMemo(
    () => new Set(model.selectedRepos.map((repo) => repo.id)),
    [model.selectedRepos]
  )
  const viewers = useTaskScopeViewers(
    {
      ...model,
      appliedTaskSearch: '',
      repoMap: new Map(repos.map((repo) => [repo.id, repo])),
      selectedScopeRepoIds: selectedRepoIds,
      taskRefreshNonce: 0,
      workItemsInvalidationNonce: 0
    },
    result,
    active
  )
  const query = buildCodeHubGoalQuery(model)
  const { setCodehubItems, setCodehubLoading, setCodehubError } = model
  useEffect(() => {
    if (!goal || model.taskSource !== 'codehub') {
      return
    }
    const items = result
      ? projectWorkbenchTaskScope({
          result,
          selectedRepoIds,
          githubIssueView: false,
          githubQuery: '',
          viewerLogins: viewers.logins,
          githubPageSize: 1,
          codehubIssueView: active,
          codehubQuery: query,
          codehubPreset: model.codehubPreset,
          blocked: !!viewers.error || viewers.loading
        }).codehubItems
      : []
    setCodehubItems(items)
    setCodehubLoading(active && (loading || viewers.loading || (!result && !error)))
    setCodehubError(active ? (viewers.error ?? error) : null)
  }, [
    goal,
    model.taskSource,
    model.codehubPreset,
    result,
    selectedRepoIds,
    active,
    query,
    viewers.logins,
    viewers.loading,
    viewers.error,
    loading,
    error,
    setCodehubItems,
    setCodehubLoading,
    setCodehubError
  ])
  return {
    missing: active ? (result?.missing ?? []) : [],
    readyCount: result?.codehubItems.length ?? 0
  }
}
