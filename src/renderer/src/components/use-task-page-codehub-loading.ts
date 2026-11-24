import { createTaskPageCodeHubApi, getCodeHubRepoSourceContext } from '@/lib/codehub-api'
import type { Repo } from '../../../shared/repository/repo-types'
import type { CodeHubListTasksArgs } from '../../../shared/codehub-api'
import { useEffect, useRef, useState } from 'react'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import { nativeTaskReferenceReader } from '@/workbench/native-task-port'
import type { TaskScopeMissingRow } from '@/workbench/task-scope-load'
import { normalizeGitRemoteUrl } from '../../../shared/git/remotes/git-remote-identity'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host/execution-host'
import type { TaskSourceContext } from '../../../shared/work-items/task-source-context'
import { type WorkbenchTaskScope, workbenchVersionTaskLabel } from '../../../shared/workbench/task-scope'

const CODEHUB_LIST_LIMIT = 250
// Why: 空数组必须是稳定引用，否则非 MR 视图下 effect 依赖每次渲染都变。
const NO_SERVER_LABELS: string[] = []

export type CodeHubTaskRow = CodeHubTaskItem & { sourceContext?: TaskSourceContext | null }

type CodeHubLoadingInput = {
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
  const [codehubScopeMissing, setCodehubScopeMissing] = useState<TaskScopeMissingRow[]>([])
  const lastRefreshNonce = useRef(model.codehubRefreshNonce)
  const {
    selectedRepos,
    taskSource,
    scopeRepoId,
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
    setCodehubScopeMissing([])
    const force = codehubRefreshNonce !== lastRefreshNonce.current
    lastRefreshNonce.current = codehubRefreshNonce
    const goal = workbenchTaskScope?.goalId ? workbenchTaskScope : null
    const repos = selectedRepos.filter((repo) => isCodeHubGitRemote(repo.gitRemoteIdentity))
    if ((!goal && repos.length === 0) || (goal && codehubView !== 'issues')) {
      setCodehubItems([])
      setCodehubLoading(false)
      setCodehubError(null)
      return
    }
    const state = codehubView === 'issues' && codehubState === 'merged' ? 'opened' : codehubState
    let stale = false
    setCodehubLoading(true)
    setCodehubError(null)
    if (goal) {
      const seenReferences = new Set<string>()
      const references = goal.references.filter((reference) => {
        if (reference.provider !== 'codehub') {
          return false
        }
        const key = JSON.stringify([
          normalizeGitRemoteUrl(reference.repository) ?? reference.repository,
          reference.number
        ])
        if (seenReferences.has(key)) {
          return false
        }
        seenReferences.add(key)
        return true
      })
      const controller = new AbortController()
      void nativeTaskReferenceReader
        .read(
          {
            repoId: scopeRepoId ?? '',
            hostId: goal.homeHostId ?? LOCAL_EXECUTION_HOST_ID,
            runtimeOwnerEnvironmentId: goal.runtimeOwnerEnvironmentId
          },
          references.map((reference) => ({ ...reference, kind: 'issue' })),
          force,
          controller.signal
        )
        .then((values) => {
          if (controller.signal.aborted) {
            return
          }
          const items: CodeHubTaskRow[] = []
          const missing: TaskScopeMissingRow[] = []
          for (const [index, reference] of references.entries()) {
            const value = values[index]
            if (value?.kind === 'codehub') {
              items.push({ ...value.item, sourceContext: value.source })
            } else {
              missing.push({
                ...reference,
                reason: value?.kind === 'unavailable' ? value.error : '尚未读取'
              })
            }
          }
          setCodehubItems(items)
          setCodehubScopeMissing(missing)
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setCodehubError(reason instanceof Error ? reason.message : String(reason))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setCodehubLoading(false)
          }
        })
      return () => controller.abort()
    }
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
    scopeRepoId,
    workbenchTaskScope
  ])
  return { ...model, codehubHasMore, codehubScopeMissing }
}

export type TaskPageCodeHubLoadingModel = ReturnType<typeof useTaskPageCodeHubLoading>
