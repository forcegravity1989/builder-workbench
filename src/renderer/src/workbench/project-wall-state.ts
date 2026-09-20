import { useSyncExternalStore } from 'react'

let wallOpen = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function openProjectWall(): void {
  wallOpen = true
  emit()
}

export function closeProjectWall(): void {
  wallOpen = false
  emit()
}

export function isProjectWallOpen(): boolean {
  return wallOpen
}

export function useProjectWallOpen(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      return () => {
        listeners.delete(onStoreChange)
      }
    },
    isProjectWallOpen,
    () => false
  )
}
