import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'

export type ProjectOnboardOptions = {
  attachToGroupId?: string
  seedName?: string
  attachLabel?: string
}

type ProjectPage = { kind: 'wall' } | { kind: 'onboard'; options: ProjectOnboardOptions } | null

let projectPage: ProjectPage = null
const listeners = new Set<() => void>()

function setProjectPage(page: ProjectPage): void {
  projectPage = page
  for (const listener of listeners) {
    listener()
  }
}

export function openProjectWall(): void {
  useAppStore.getState().openActivityPage()
  setProjectPage({ kind: 'wall' })
}

export function openProjectOnboard(options: ProjectOnboardOptions = {}): void {
  useAppStore.getState().openActivityPage()
  setProjectPage({ kind: 'onboard', options: { ...options } })
}

export function closeProjectPage(): void {
  if (projectPage) {
    setProjectPage(null)
  }
}

useAppStore.subscribe((state, previous) => {
  if (state.activeView !== previous.activeView) {
    closeProjectPage()
  }
})

export function useProjectPage(): ProjectPage {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => projectPage,
    () => null
  )
}
