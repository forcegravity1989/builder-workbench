import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import { useAutoWorktreeBase } from './use-auto-worktree-base'
import { nativeWorkspaceScope } from './native-workspace'
import { cycleScopeForWorktree, ensureCycleWorktree } from './native-cycle-workspace'
import { cycleWorkflowForWorktree } from '../workbench-nav'
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
  const baseScope = base.scope
  useEffect(() => {
    setError(null)
    if (!preparing || !baseScope || !baseSettled || !workflow) {
      return
    }
    let current = true
    void (async () => {
      try {
        const fixed = await ensureCycleWorktree({ ...baseScope, workflow })
        if (!current) {
          return
        }
        if (baseScope.runtimeOwnerEnvironmentId) {
          await activateWebRuntimeSessionWorktree({
            worktreeId: fixed.id,
            environmentId: baseScope.runtimeOwnerEnvironmentId
          })
        }
        if (!current) {
          return
        }
        const state = useAppStore.getState()
        state.setActiveWorktree(fixed.id, baseScope.hostId)
        state.setActiveView('terminal')
      } catch (reason) {
        if (current) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    })()
    return () => {
      current = false
    }
  }, [preparing, baseScope, baseSettled, workflow])
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
  return {
    worktree: resolved.scope ? worktree : null,
    scope,
    error: error ?? resolved.error ?? (preparing ? base.error : null)
  }
}
