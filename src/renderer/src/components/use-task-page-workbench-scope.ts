import { useEffect, useMemo, useState } from 'react'
import type { TaskPageJiraCreationMetadataModel } from './use-task-page-jira-creation-metadata'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import { workbenchTaskScopeKey } from '../../../shared/workbench/task-scope'
import {
  loadWorkbenchTaskScope,
  versionTaskScopeHome,
  type TaskScopeLoadResult,
  type TaskScopeMissingRow
} from '@/workbench/task-scope-load'

/**
 * G2 (BW overlay) 范围阶段：TaskPageData 带 workbenchTaskScope 时，用计划材料的
 * 完整任务引用集经原生 provider 读取并物化列表页（读取/排序/搜索/分页/详情仍走
 * 原生机制）；缺数据任务保留位置、数量与原因。无范围时本阶段零副作用，
 * 原生任务页行为逐字不变。范围不进搜索 query 或 provider 缓存键。
 */
export function useTaskPageWorkbenchScope(model: TaskPageJiraCreationMetadataModel) {
  const {
    pageData,
    taskResumeApplied,
    taskRefreshNonce,
    codehubRefreshNonce,
    workItemsInvalidationNonce,
    githubPageSize,
    setPages,
    setCurrentPage,
    setCountedTotalPages,
    setTasksLoading,
    setTasksError,
    setFailedCount,
    setGithubUnavailable,
    setTaskSearchInput,
    setAppliedTaskSearch,
    setActiveTaskPreset,
    setCodehubItems,
    setCodehubLoading,
    setCodehubError
  } = model
  const scope = pageData.workbenchTaskScope ?? null
  const scopeKey = useMemo(() => (scope ? workbenchTaskScopeKey(scope) : null), [scope])
  const [scopeLoad, setScopeLoad] = useState<{ key: string; result: TaskScopeLoadResult } | null>(
    null
  )
  const [scopeLoading, setScopeLoading] = useState(false)
  const [scopeError, setScopeError] = useState<string | null>(null)

  // 进入范围视图时清掉无范围残留的查询/预设与失败横幅状态：范围搜索是客户端
  // 语义，持久化的 resume 查询不得预涂成范围过滤条件（防串范围）；上一次
  // 无范围访问的部分失败计数也不得冒充本范围的读取结果。
  useEffect(() => {
    if (!scopeKey) {
      return
    }
    setTaskSearchInput('')
    setAppliedTaskSearch('')
    setActiveTaskPreset(null)
    setFailedCount(0)
    setGithubUnavailable(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  useEffect(() => {
    if (!scope || !scopeKey || !taskResumeApplied) {
      return
    }
    let cancelled = false
    setScopeLoading(true)
    setTasksLoading(true)
    setTasksError(null)
    setCodehubLoading(true)
    setCodehubError(null)
    void (async () => {
      try {
        const home = versionTaskScopeHome()
        if (!home) {
          throw new Error('无法解析当前项目的任务范围宿主')
        }
        const result = await loadWorkbenchTaskScope(scope, home)
        if (cancelled) {
          return
        }
        setScopeLoad({ key: scopeKey, result })
        setScopeError(null)
        setTasksError(null)
        setCodehubError(null)
      } catch (reason) {
        if (cancelled) {
          return
        }
        const message = reason instanceof Error ? reason.message : String(reason)
        setScopeLoad(null)
        setScopeError(message)
        setPages([[]])
        setCurrentPage(0)
        setCountedTotalPages(null)
        setCodehubItems([])
        // 范围读取整体失败：按来源如实呈现，不退回无范围的全局列表冒充结果。
        if (scope.references.some((reference) => reference.provider === 'github')) {
          setTasksError(message)
        } else {
          setCodehubError(message)
        }
      } finally {
        if (!cancelled) {
          setScopeLoading(false)
          setTasksLoading(false)
          setCodehubLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // Why: scopeKey fences generations; nonces reuse the native refresh affordances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, taskResumeApplied, taskRefreshNonce, codehubRefreshNonce, workItemsInvalidationNonce])

  // 物化分页：整份范围一次读回，按原生页大小切页；翻页只是本地换页，不再打 provider。
  const result = scopeLoad && scopeKey && scopeLoad.key === scopeKey ? scopeLoad.result : null
  useEffect(() => {
    if (!scope || !result) {
      return
    }
    const items = result.githubItems
    const pageSize = Math.max(1, githubPageSize)
    const pages: (GitHubWorkItem[] | null)[] = []
    for (let start = 0; start < items.length; start += pageSize) {
      pages.push(items.slice(start, start + pageSize))
    }
    if (pages.length === 0) {
      pages.push([])
    }
    setPages(pages)
    setCurrentPage(0)
    setCountedTotalPages(pages.length)
    setCodehubItems(result.codehubItems)
  }, [scope, result, githubPageSize, setPages, setCurrentPage, setCountedTotalPages, setCodehubItems])

  // 范围成员键：投影层的成员过滤依据（原生缓存预涂行不得混入范围列表）。
  const scopeItemKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!result) {
      return keys
    }
    for (const item of result.githubItems) {
      keys.add(`${item.repoId}:${item.number}`)
    }
    return keys
  }, [result])

  const nextModel = model as typeof model & {
    workbenchScopeActive: boolean
    workbenchScope: typeof scope
    workbenchScopeLoading: boolean
    workbenchScopeError: string | null
    workbenchScopeMissing: TaskScopeMissingRow[]
    workbenchScopeReadyCount: number
    workbenchScopeViewProvider: 'github' | 'codehub' | null
    workbenchScopeItemKeys: Set<string>
  }
  nextModel.workbenchScopeActive = scope !== null
  nextModel.workbenchScope = scope
  nextModel.workbenchScopeLoading = scopeLoading
  nextModel.workbenchScopeError = scopeError
  nextModel.workbenchScopeMissing = result?.missing ?? []
  nextModel.workbenchScopeReadyCount = result
    ? result.viewProvider === 'github'
      ? result.githubItems.length
      : result.codehubItems.length
    : 0
  nextModel.workbenchScopeViewProvider = result?.viewProvider ?? null
  nextModel.workbenchScopeItemKeys = scopeItemKeys
  return nextModel
}
export type TaskPageWorkbenchScopeModel = ReturnType<typeof useTaskPageWorkbenchScope>
