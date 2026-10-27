import React from 'react'
import type { WorkbenchTaskScope } from '../../../shared/workbench/task-scope'
import type { TaskScopeMissingRow } from './task-scope-load'
import { X } from 'lucide-react'
import { workbenchVersionTaskLabel } from '../../../shared/workbench/task-scope'

/**
 * Removable version/goal filters and unreadable goal-reference facts. Native
 * controls and rows remain the only task page; no separate task authority.
 * 不另造列表、行形态或任务正本；无范围时组件自渲染 null，原生行为逐字不变。
 * 以最小结构类型接收任务屏 model，避免 BW 组件反向依赖原生阶段类型。
 */

export const WORKBENCH_GOAL_SEARCH_PLACEHOLDER = '搜索目标标题或编号…'

type TaskScopeChromeModel = {
  workbenchScopeActive: boolean
  workbenchScope: WorkbenchTaskScope | null
  workbenchScopeLoading: boolean
  workbenchScopeMissing: TaskScopeMissingRow[]
  workbenchScopeReadyCount: number
  workbenchScopeError?: string | null
  clearWorkbenchVersion: () => void
  clearWorkbenchGoal: () => void
}

export function TaskPageScopeHeader({
  model
}: {
  model: TaskScopeChromeModel
}): React.JSX.Element | null {
  const { workbenchScope } = model
  if (!workbenchScope) {
    return null
  }
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground"
      aria-label="当前筛选条件"
    >
      <span className="rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 font-medium text-foreground">
        {workbenchVersionTaskLabel(workbenchScope.version)}
        <button
          type="button"
          className="ml-1 align-middle"
          aria-label="移除版本筛选"
          onClick={model.clearWorkbenchVersion}
        >
          <X className="size-3" />
        </button>
      </span>
      {workbenchScope.goalId ? (
        <span className="rounded-full border border-border/40 bg-muted/30 px-2 py-0.5">
          目标 {workbenchScope.goalLabel || workbenchScope.goalId}
          <button
            type="button"
            className="ml-1 align-middle"
            aria-label="移除目标筛选"
            onClick={model.clearWorkbenchGoal}
          >
            <X className="size-3" />
          </button>
        </span>
      ) : null}
    </div>
  )
}

export function TaskPageScopeFooter({
  model,
  extraLoading = false,
  filteredCount = null
}: {
  model: TaskScopeChromeModel
  /** 原生骨架屏等本视图自己的加载态。 */
  extraLoading?: boolean
  /** 当前页过滤后可见行数；给出时用于「搜索无匹配」的如实提示。 */
  filteredCount?: number | null
}): React.JSX.Element | null {
  const {
    workbenchScopeActive,
    workbenchScope,
    workbenchScopeLoading,
    workbenchScopeMissing,
    workbenchScopeReadyCount
  } = model
  if (!workbenchScopeActive || !workbenchScope) {
    return null
  }
  const loading = workbenchScopeLoading || extraLoading
  const filteredZero =
    !loading &&
    !model.workbenchScopeError &&
    filteredCount !== null &&
    filteredCount === 0 &&
    workbenchScopeReadyCount > 0
  const empty =
    !loading &&
    !filteredZero &&
    !model.workbenchScopeError &&
    workbenchScopeReadyCount === 0 &&
    workbenchScopeMissing.length === 0
  return (
    <>
      {model.workbenchScopeError ? (
        <p role="status" className="px-3 py-2 text-xs text-destructive">
          {model.workbenchScopeError}
        </p>
      ) : null}
      {workbenchScopeMissing.length > 0 ? (
        <div className="border-t border-border/50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {workbenchScopeMissing.length} 个任务未在本视图呈现（如实保留，不静默丢弃）
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {workbenchScopeMissing.map((row) => (
              <li
                key={`${row.provider}:${row.repository}:${row.number}`}
                className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-muted-foreground"
              >
                <span className="font-mono">
                  #{row.number} <span className="text-[10px]">({row.provider})</span>
                </span>
                <span className="truncate">{row.repository}</span>
                <span>— {row.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {filteredZero ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">没有匹配当前搜索的任务。</p>
        </div>
      ) : null}
      {empty ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {workbenchScope.references.length === 0
              ? workbenchScope.goalId
                ? '此目标在本版计划中没有任务引用。'
                : '此版本计划还没有任务引用。'
              : '范围内没有本视图可呈现的任务。'}
          </p>
        </div>
      ) : null}
    </>
  )
}
