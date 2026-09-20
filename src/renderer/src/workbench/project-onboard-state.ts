import { useSyncExternalStore } from 'react'

export type ProjectOnboardOptions = {
  /** When set, the newly added repo is moved into this ProjectGroup. */
  attachToGroupId?: string
  /** Prefill project name (e.g. when adding a slot under an existing wall project). */
  seedName?: string
  /** Wall project key — for UI copy only. */
  attachLabel?: string
}

let onboardOpen = false
let onboardOptions: ProjectOnboardOptions = {}
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) {
    l()
  }
}

export function openProjectOnboard(options: ProjectOnboardOptions = {}): void {
  onboardOptions = { ...options }
  onboardOpen = true
  emit()
}

export function closeProjectOnboard(): void {
  onboardOpen = false
  onboardOptions = {}
  emit()
}

export function getProjectOnboardOptions(): ProjectOnboardOptions {
  return onboardOptions
}

export function isProjectOnboardOpen(): boolean {
  return onboardOpen
}

export function useProjectOnboardOpen(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      return () => {
        listeners.delete(onStoreChange)
      }
    },
    () => onboardOpen,
    () => false
  )
}

export function useProjectOnboardOptions(): ProjectOnboardOptions {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      return () => {
        listeners.delete(onStoreChange)
      }
    },
    () => onboardOptions,
    () => ({})
  )
}
