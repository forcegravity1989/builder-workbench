import { useSyncExternalStore } from 'react'
import type { VersionCycleContext } from './version-cycle/cycle-context'
import type { CycleScope } from './version-cycle/ports'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  PlanningProgressSource
} from '../../../shared/workbench/version-material'

// View memory only: successful native launches survive screen switches, never a
// renderer restart. No material or session state is inferred from this record.
const startedCycles = new Set<string>()

export function cycleStartedViewKey({
  scope,
  worktreeId,
  worktreeInstanceId,
  version
}: Pick<VersionCycleContext, 'scope' | 'worktreeId' | 'worktreeInstanceId' | 'version'>):
  | string
  | undefined {
  return scope && worktreeId
    ? JSON.stringify([
        scope.projectId,
        scope.repoId,
        scope.hostId,
        scope.runtimeOwnerEnvironmentId ?? '',
        scope.workflow,
        worktreeId,
        worktreeInstanceId ?? '',
        version
      ])
    : undefined
}

export function hasCycleStarted(key: string | undefined): boolean {
  return key !== undefined && startedCycles.has(key)
}

/** Call only after start() confirms that the native run's session opened. */
export function markCycleStarted(key: string | undefined): void {
  if (key !== undefined) {
    startedCycles.add(key)
  }
}

export function goalCardViewKey(scope: CycleScope | null, version: string, goalId: string) {
  return scope
    ? `workbench.goal-card:${JSON.stringify([
        scope.projectId,
        scope.repoId,
        scope.hostId,
        scope.runtimeOwnerEnvironmentId ?? '',
        scope.workflow,
        version,
        goalId
      ])}`
    : undefined
}

export function readGoalCardExpanded(key: string | undefined, fallback: boolean): boolean {
  if (!key) {
    return fallback
  }
  try {
    const value = window.localStorage.getItem(key)
    return value === 'true' ? true : value === 'false' ? false : fallback
  } catch {
    return fallback
  }
}

export function writeGoalCardExpanded(key: string | undefined, expanded: boolean): void {
  if (!key) {
    return
  }
  try {
    window.localStorage.setItem(key, String(expanded))
  } catch {
    // A denied browser storage keeps this view's in-memory state usable.
  }
}

/**
 * BW sub-view inside the shared Orca `artifacts` slot (see workbench-nav.ts):
 * plan and acceptance are two sidebar entries over one TopLevelView value,
 * so the upstream union stays untouched.
 */
export type CycleView = 'plan' | 'acceptance'

/** One navigation's verified bytes; never a material selection or a persistent cache. */
export type FixedAcceptanceBrowse = {
  scope: CycleScope
  originWorktreeId: string
  originWorktreeInstanceId: string | null
  originExecutionHostId: string | null
  originPlan: Pick<PlanningMaterial, 'version' | 'cycleId'>
  source: PlanningProgressSource
  acceptance: AcceptanceMaterial
  plan: PlanningMaterial
}

let current: CycleView = 'plan'
let fixedAcceptanceBrowse: FixedAcceptanceBrowse | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCycleView(): CycleView {
  return current
}

export function setCycleView(view: CycleView): void {
  if (current === view && fixedAcceptanceBrowse === null) {
    return
  }
  current = view
  fixedAcceptanceBrowse = null
  listeners.forEach((listener) => listener())
}

export function openFixedAcceptanceBrowse(view: FixedAcceptanceBrowse): void {
  current = 'acceptance'
  fixedAcceptanceBrowse = view
  listeners.forEach((listener) => listener())
}

export function clearFixedAcceptanceBrowse(): void {
  if (fixedAcceptanceBrowse === null) {
    return
  }
  fixedAcceptanceBrowse = null
  listeners.forEach((listener) => listener())
}

export function useFixedAcceptanceBrowse(): FixedAcceptanceBrowse | null {
  return useSyncExternalStore(
    subscribe,
    () => fixedAcceptanceBrowse,
    () => null
  )
}

export function useCycleView(): CycleView {
  return useSyncExternalStore(subscribe, getCycleView, getCycleView)
}
