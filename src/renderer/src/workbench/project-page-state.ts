import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'

export type ProjectOnboardOptions = {
  attachToGroupId?: string
  seedName?: string
  attachLabel?: string
}

export type CharterEditOptions = {
  repoId: string
  seedName?: string
}

type ProjectPage =
  | { kind: 'wall' }
  | { kind: 'onboard'; options: ProjectOnboardOptions }
  | { kind: 'charter'; options: CharterEditOptions }
  | null

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

/** 名片补录/编辑入口(spec 规则 2):复用 bw/project 固定树与 PR 流。 */
export function openCharterEdit(options: CharterEditOptions): void {
  useAppStore.getState().openActivityPage()
  setProjectPage({ kind: 'charter', options: { ...options } })
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
