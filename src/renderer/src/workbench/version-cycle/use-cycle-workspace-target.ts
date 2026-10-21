import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import type { Worktree } from '../../../../shared/worktree/types'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import { findVersionFlowWorktrees } from '../../../../shared/workbench/version-workspace-match'
import { useAutoWorktreeBase } from './use-auto-worktree-base'
import { nativeWorkspaceScope, nativeWorkspaceScopeKey } from './native-workspace'
import {
  cycleScopeKey,
  cycleScopeForWorktree,
  ensureCycleWorktree,
  findCycleWorktree
} from './native-cycle-workspace'
import { updateTrunkCode } from './trunk-update-port'
import { cycleWorkflowForWorktree } from '../workbench-nav'
import { useBrowsedVersion } from '../version-context-state'
import { nativeVersionMaterialPort } from '../version-material-port'
import type { TrunkUpdateResult } from '../../../../shared/workbench/trunk-update'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { CycleScope } from './ports'

/** Native HEAD/unread updates must not reset the material ports or workflow selection. */
function useStableCycleScope(value: CycleScope | null) {
  const { projectId, repoId, hostId, runtimeOwnerEnvironmentId, workflow } = value ?? {}
  return useMemo(
    () =>
      projectId && repoId && hostId && workflow
        ? { projectId, repoId, hostId, runtimeOwnerEnvironmentId, workflow }
        : null,
    [projectId, repoId, hostId, runtimeOwnerEnvironmentId, workflow]
  )
}

/** Navigation prepares a native workspace once; it never owns or reselects its sessions. */
export function useCycleWorkspaceTarget(
  workflow: VersionWorkflow | null,
  onNotice: (text: string) => void
) {
  const activeView = useAppStore((state) => state.activeView)
  const repoId = useAppStore((state) => state.activeRepoId ?? state.repos[0]?.id ?? null)
  const repo = useAppStore((state) => state.repos.find((item) => item.id === repoId))
  const trees = useAppStore((state) => (repoId ? state.worktreesByRepo[repoId] : undefined))
  const selected = useAppStore((state) =>
    state.activeWorktreeId ? state.getKnownWorktreeById(state.activeWorktreeId) : null
  )
  const [error, setError] = useState<string | null>(null)
  const syncSequence = useRef(0)
  const [syncStates, setSyncStates] = useState<
    Record<
      string,
      {
        sequence: number
        busy: boolean
        revision: number
      }
    >
  >({})
  const preparing = workflow !== null && activeView === 'artifacts'
  const baseSettled = useAutoWorktreeBase(
    preparing ? repoId : null,
    repo?.worktreeBasePath?.trim() || null,
    onNotice
  )
  useEffect(() => {
    if (preparing && repoId && !trees) {
      void useAppStore
        .getState()
        .fetchWorktrees(repoId)
        .catch((reason) => setError(String(reason)))
    }
  }, [preparing, repoId, trees])
  const home = trees?.find((item) => item.isMainWorktree) ?? trees?.[0]
  const base = useMemo(() => {
    try {
      return { scope: home ? nativeWorkspaceScope(home) : null, error: null }
    } catch (reason) {
      return { scope: null, error: String(reason) }
    }
  }, [home])
  const baseScope = useStableCycleScope(base.scope && workflow ? { ...base.scope, workflow } : null)
  // Screen entry is read-only: it prepares and activates the fixed worktree and
  // stops there. No fetch, no pull, no sync notices — the「更新代码」button is
  // the only action that touches Git, and only when the user clicks it.
  // G2 (P3a)：侧栏带入的浏览版本优先按绑定树定位（绝不从分支名反推）；无绑定
  // 树时仅在旧固定树已存在才走旧路径（旧上下文显式保留）；两者皆无如实报错，
  // 不为浏览悄悄建树。无浏览版本时保持原有 ensure 语义逐字不变。
  const browsedVersion = useBrowsedVersion(repoId)
  useEffect(() => {
    setError(null)
    if (!preparing || !baseScope || !baseSettled || !workflow) {
      return
    }
    let current = true
    void (async () => {
      try {
        let chosen: Worktree | null = null
        if (browsedVersion) {
          const bound = findVersionFlowWorktrees(useAppStore.getState().allWorktrees(), {
            version: browsedVersion,
            workflow
          })
          const inScope = bound.filter((tree) => {
            try {
              return (
                nativeWorkspaceScopeKey(nativeWorkspaceScope(tree)) ===
                nativeWorkspaceScopeKey(baseScope)
              )
            } catch {
              return false
            }
          })
          if (inScope.length > 1) {
            throw new Error(
              `版本 ${browsedVersion} 在本宿主有多个绑定的流程树，请在侧栏选择具体工作区。`
            )
          }
          chosen = inScope[0] ?? (bound.length === 1 ? bound[0] : null)
          if (bound.length > 1 && !chosen) {
            throw new Error(`版本 ${browsedVersion} 有多个绑定流程树实例，请在侧栏选择具体工作区。`)
          }
          if (!chosen && !findCycleWorktree({ ...baseScope, workflow })) {
            throw new Error(
              `版本 ${browsedVersion} 没有可用的${
                workflow === 'plan' ? '计划' : '验收'
              }工作区（无绑定树，也无旧固定树）。可在版本行菜单「准备流程工作区」；材料回看不建树。`
            )
          }
        }
        const fixed = chosen ?? (await ensureCycleWorktree({ ...baseScope, workflow }))
        if (!current) {
          return
        }
        const fixedScope = cycleScopeForWorktree(fixed, workflow)
        if (fixedScope.runtimeOwnerEnvironmentId) {
          await activateWebRuntimeSessionWorktree({
            worktreeId: fixed.id,
            environmentId: fixedScope.runtimeOwnerEnvironmentId
          })
        }
        if (!current) {
          return
        }
        const sequence = ++syncSequence.current
        const key = JSON.stringify([cycleScopeKey(fixedScope), fixed.id])
        setSyncStates((previous) => ({
          ...previous,
          [key]: {
            sequence,
            busy: true,
            revision: previous[key]?.revision ?? 0
          }
        }))
        const state = useAppStore.getState()
        state.setActiveWorktree(fixed.id, fixedScope.hostId)
        state.setActiveView('terminal')
        setSyncStates((previous) =>
          previous[key]?.sequence === sequence
            ? { ...previous, [key]: { ...previous[key], busy: false } }
            : previous
        )
      } catch (reason) {
        if (current) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    })()
    return () => {
      current = false
    }
  }, [preparing, baseScope, baseSettled, workflow, browsedVersion])
  const worktree =
    !preparing && workflow && cycleWorkflowForWorktree(selected) === workflow ? selected : null
  const resolved = useMemo(() => {
    try {
      return {
        scope: worktree && workflow ? cycleScopeForWorktree(worktree, workflow) : null,
        error: null
      }
    } catch (reason) {
      return { scope: null, error: String(reason) }
    }
  }, [worktree, workflow])
  const scope = useStableCycleScope(resolved.scope)
  const key = scope && worktree ? JSON.stringify([cycleScopeKey(scope), worktree.id]) : null
  const sync = key ? syncStates[key] : null
  // G2 (P3a)：侧栏浏览版本同步到旧固定树的选版偏好（每个 树×版本 只应用一次，
  // 屏内选版仍可改——旧上下文显式保留）；绑定树不写选版（版本由绑定决定）。
  const selectAppliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!scope || !worktree || !browsedVersion) {
      return
    }
    if (normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)) {
      return
    }
    const appliedKey = `${worktree.id}:${browsedVersion}`
    if (selectAppliedRef.current === appliedKey) {
      return
    }
    selectAppliedRef.current = appliedKey
    let cancelled = false
    void (async () => {
      try {
        const port = nativeVersionMaterialPort(
          {
            repoId: scope.repoId,
            worktreeId: worktree.id,
            hostId: scope.hostId,
            workflow: scope.workflow
          },
          scope.runtimeOwnerEnvironmentId
        )
        const context = await port.context()
        if (cancelled) {
          return
        }
        if (context.version !== browsedVersion) {
          await port.select(browsedVersion)
        }
      } catch (reason) {
        if (!cancelled) {
          onNotice(`同步侧栏选版失败：${reason instanceof Error ? reason.message : String(reason)}`)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scope, worktree, browsedVersion, onNotice])
  const updateCode = useCallback(async (): Promise<TrunkUpdateResult> => {
    if (!scope || !worktree) {
      return { updated: false, pulled: 0, reason: '工作区尚未就绪，请稍后再试' }
    }
    const sequence = ++syncSequence.current
    const stateKey = JSON.stringify([cycleScopeKey(scope), worktree.id])
    setSyncStates((previous) => ({
      ...previous,
      [stateKey]: {
        sequence,
        busy: true,
        revision: previous[stateKey]?.revision ?? 0
      }
    }))
    let result: TrunkUpdateResult
    try {
      result = await updateTrunkCode(
        { repoId: scope.repoId, worktreeId: worktree.id, hostId: scope.hostId },
        scope.runtimeOwnerEnvironmentId
      )
    } catch (reason) {
      result = {
        updated: false,
        pulled: 0,
        reason: reason instanceof Error ? reason.message : String(reason)
      }
    }
    // Materials re-read whether the fast-forward happened, was refused or
    // failed: session-side edits must stay visible through this button.
    setSyncStates((previous) =>
      previous[stateKey]?.sequence === sequence
        ? {
            ...previous,
            [stateKey]: {
              ...previous[stateKey],
              busy: false,
              revision: previous[stateKey].revision + 1
            }
          }
        : previous
    )
    return result
  }, [scope, worktree])
  return {
    worktree: resolved.scope ? worktree : null,
    scope,
    syncing: sync?.busy ?? false,
    materialRefresh: sync?.revision ?? 0,
    updateCode,
    error: error ?? resolved.error ?? (preparing ? base.error : null)
  }
}
