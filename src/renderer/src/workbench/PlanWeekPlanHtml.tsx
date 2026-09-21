import React, { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type { WorkbenchPlanningStartResult } from '../../../shared/workbench-planning'
import {
  resolveWeekPlanHomeWorktreeId,
  weekPlanProjectKey,
  weekPlanProjectWorktreeIds
} from './plan-week-plan-identity'
import { readWeekPlanSessionAnchor } from './plan-week-plan-anchor'

type HtmlState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: WorkbenchPlanningStartResult }
  | { kind: 'failed'; error: string }

export function PlanWeekPlanHtml(): React.JSX.Element {
  const { workspacePath, projectKey } = useAppStore(
    useShallow((state) => {
      const activeWorktreeId = state.activeWorktreeId
      if (!activeWorktreeId) {
        return { workspacePath: null, projectKey: null }
      }
      const worktrees = state.allWorktrees?.() ?? []
      const projectWorktreeIds = weekPlanProjectWorktreeIds(activeWorktreeId, worktrees)
      const projectKey = weekPlanProjectKey(
        state.getKnownWorktreeById(activeWorktreeId),
        activeWorktreeId
      )
      const anchor = readWeekPlanSessionAnchor(projectKey)
      const homeWorktreeId = resolveWeekPlanHomeWorktreeId({
        activeWorktreeId,
        projectWorktreeIds,
        worktrees,
        storedWorktreeId: anchor?.worktreeId
      })
      return {
        workspacePath: state.getKnownWorktreeById(homeWorktreeId)?.path ?? null,
        projectKey
      }
    })
  )
  const [htmlState, setHtmlState] = useState<HtmlState>({ kind: 'idle' })
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  const start = useCallback(async (path: string, key: string) => {
    setHtmlState({ kind: 'loading' })
    setLoadedKey(key)
    try {
      const startPlanning = window.api.workbenchPlanning?.start
      if (!startPlanning) {
        throw new Error('当前壳还没有规划服务，请重启 Workbench')
      }
      const result = await startPlanning(path)
      setHtmlState({ kind: 'ready', result })
    } catch (error) {
      setHtmlState({
        kind: 'failed',
        error: error instanceof Error && error.message.trim() ? error.message : '无法打开周一屏'
      })
    }
  }, [])

  useEffect(() => {
    if (!workspacePath || !projectKey) {
      setHtmlState({ kind: 'idle' })
      setLoadedKey(null)
      return
    }
    if (loadedKey === projectKey && htmlState.kind !== 'idle') {
      return
    }
    void start(workspacePath, projectKey)
  }, [htmlState.kind, loadedKey, projectKey, start, workspacePath])

  if (!workspacePath) {
    return (
      <div className="plan-html-host">
        <div className="plan-html-empty">
          <p>先在左侧选一个项目</p>
          <p className="wb-muted">选好之后会在这里打开周一屏。</p>
        </div>
      </div>
    )
  }

  if (htmlState.kind === 'failed') {
    return (
      <div className="plan-html-host">
        <div className="plan-html-empty">
          <p>{htmlState.error}</p>
          <button
            className="wb-btn wb-btn-primary wb-btn-sm"
            type="button"
            onClick={() => {
              if (workspacePath && projectKey) {
                void start(workspacePath, projectKey)
              }
            }}
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (htmlState.kind !== 'ready') {
    return (
      <div className="plan-html-host">
        <div className="plan-html-empty">
          <p>正在打开周一屏…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="plan-html-host">
      <iframe
        className="plan-html-frame"
        title={`版本计划 ${htmlState.result.version}`}
        src={htmlState.result.url}
      />
    </div>
  )
}
