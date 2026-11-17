import { useSyncExternalStore } from 'react'
import type { Worktree } from '../../../shared/worktree/types'

let selectedTree: Worktree | null = null
const listeners = new Set<() => void>()

export function selectVersionBindingTree(tree: Worktree | null): void {
  selectedTree = tree
  for (const listener of listeners) {
    listener()
  }
}

export function useVersionBindingTree(): Worktree | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => selectedTree,
    () => null
  )
}
