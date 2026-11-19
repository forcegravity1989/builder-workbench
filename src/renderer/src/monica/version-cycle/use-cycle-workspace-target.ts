import { useCallback, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { cycleScopeKey, cycleScopeForWorktree } from './native-cycle-workspace'
import { updateTrunkCode } from './trunk-update-port'
import { cycleWorkflowForWorktree } from '../monica-nav'
import type { TrunkUpdateResult } from '../../../../shared/monica/trunk-update'
import type { VersionWorkflow } from '../../../../shared/monica/version-document'
import type { CycleScope } from './ports'
import { useFixedAcceptanceBrowseTarget } from './use-fixed-acceptance-browse-target'
import { useProjectPage } from '../project-page-state'

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

/** Use the source chosen at navigation time for historical reads. */
export function useCycleWorkspaceTarget(workflow: VersionWorkflow | null) {
  const activeView = useAppStore((state) => state.activeView)
  const page = useProjectPage()
  const requested = activeView === 'artifacts' && page?.kind === 'cycle' ? page.options : null
  const selected = useAppStore((state) =>
    state.activeWorktreeId
      ? state.getKnownWorktreeById(
          state.activeWorktreeId,
          state.activeWorkspaceExecutionHostId ?? undefined
        )
      : null
  )
  const fixedBrowse = useFixedAcceptanceBrowseTarget(workflow)
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
  const worktree =
    !fixedBrowse &&
    activeView === 'terminal' &&
    workflow &&
    cycleWorkflowForWorktree(selected) === workflow
      ? selected
      : null
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
    // Re-read materials after any sync result so session-side edits stay visible.
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
    readonlyBrowse: fixedBrowse
      ? { version: fixedBrowse.source.version, fixedAcceptance: fixedBrowse }
      : requested
        ? { version: requested.version, source: requested.scope }
        : null,
    error: resolved.error
  }
}
