import { useSyncExternalStore } from 'react'

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
