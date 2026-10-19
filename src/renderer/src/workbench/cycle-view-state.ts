import { useSyncExternalStore } from 'react'
import type { CycleScope } from './version-cycle/ports'
import type { MetricScope } from '../../../shared/workbench/metrics'

const historySelections = new Map<string, string>()
export function acceptanceHistorySelectionKey(
  scope: MetricScope,
  version: string,
  runtimeOwnerEnvironmentId?: string
) {
  return `bw:acceptance:history:${JSON.stringify([
    scope.repoId,
    scope.worktreeId,
    scope.hostId,
    runtimeOwnerEnvironmentId ?? '',
    version
  ])}`
}

export function readAcceptanceHistorySelection(
  scope: MetricScope,
  version: string | null | undefined,
  runtimeOwnerEnvironmentId?: string
): string {
  if (!version) {
    return 'current'
  }
  const key = acceptanceHistorySelectionKey(scope, version, runtimeOwnerEnvironmentId)
  try {
    return historySelections.get(key) ?? window.sessionStorage.getItem(key) ?? 'current'
  } catch {
    return historySelections.get(key) ?? 'current'
  }
}

export function writeAcceptanceHistorySelection(
  scope: MetricScope,
  version: string,
  value: string,
  runtimeOwnerEnvironmentId?: string
): void {
  const key = acceptanceHistorySelectionKey(scope, version, runtimeOwnerEnvironmentId)
  historySelections.set(key, value)
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Navigation retains the exact selection in memory when browser storage is unavailable.
  }
}

export function goalCardViewKey(
  scope: CycleScope | null,
  version: string,
  goalId: string,
  roundId?: string
) {
  return scope
    ? `workbench.goal-card:${JSON.stringify([
        scope.projectId,
        scope.repoId,
        scope.hostId,
        scope.runtimeOwnerEnvironmentId ?? '',
        scope.workflow,
        version,
        goalId,
        roundId ?? ''
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

let current: CycleView = 'plan'
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
  if (current === view) {
    return
  }
  current = view
  listeners.forEach((listener) => listener())
}

export function useCycleView(): CycleView {
  return useSyncExternalStore(subscribe, getCycleView, getCycleView)
}
