import { useSyncExternalStore } from 'react'
import type { CycleScope } from './version-cycle/ports'

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
