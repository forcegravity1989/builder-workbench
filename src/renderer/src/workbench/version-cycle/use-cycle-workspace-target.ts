import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import { useAutoWorktreeBase } from './use-auto-worktree-base'
import { nativeWorkspaceScope } from './native-workspace'
import {
  cycleBranch,
  cycleScopeKey,
  cycleScopeForWorktree,
  ensureCycleWorktree
} from './native-cycle-workspace'
import { syncCycleTrunk } from './cycle-sync-port'
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
  const syncSequence = useRef(0)
  const [syncStates, setSyncStates] = useState<
    Record<
      string,
      {
        sequence: number
        busy: boolean
        problem: string | null
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
        const sequence = ++syncSequence.current
        const key = JSON.stringify([cycleScopeKey(baseScope), fixed.id])
        setSyncStates((previous) => ({
          ...previous,
          [key]: {
            sequence,
            busy: true,
            problem: null,
            revision: previous[key]?.revision ?? 0
          }
        }))
        const state = useAppStore.getState()
        state.setActiveWorktree(fixed.id, baseScope.hostId)
        state.setActiveView('terminal')
        // Navigation is complete before the network pull. Its completion may refresh
        // this workspace's files, but must never navigate back after the user leaves.
        let problem: string | null = null
        try {
          const sync = await syncCycleTrunk(
            { repoId: baseScope.repoId, worktreeId: fixed.id, hostId: baseScope.hostId },
            baseScope.runtimeOwnerEnvironmentId
          )
          if (!sync.synced) {
            problem = sync.reason ?? '原因未知'
          }
        } catch (reason) {
          problem = reason instanceof Error ? reason.message : String(reason)
        }
        setSyncStates((previous) =>
          previous[key]?.sequence === sequence
            ? {
                ...previous,
                [key]: {
                  ...previous[key],
                  busy: false,
                  problem,
                  revision: previous[key].revision + 1
                }
              }
            : previous
        )
        const active = useAppStore.getState()
        if (
          problem &&
          sequence === syncSequence.current &&
          active.activeView === 'terminal' &&
          active.activeWorktreeId === fixed.id &&
          active.activeWorkspaceExecutionHostId === baseScope.hostId
        ) {
          toast.message(`${cycleBranch({ workflow })} 未能同步主干最新：${problem}`)
        }
      } catch (reason) {
        if (current) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    })()
    return () => {
      current = false
    }
  }, [preparing, baseScope, baseSettled, workflow, onNotice])
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
  return {
    worktree: resolved.scope ? worktree : null,
    scope,
    syncing: sync?.busy ?? false,
    materialRefresh: sync?.revision ?? 0,
    error: error ?? resolved.error ?? (preparing ? base.error : null)
  }
}
