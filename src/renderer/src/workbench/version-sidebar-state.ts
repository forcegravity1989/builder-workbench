import { useSyncExternalStore } from 'react'

export type VersionSidebarProjection = {
  repoId: string | null
  repoIds: readonly string[]
  worktreeIdentities: ReadonlySet<string>
}

const listeners = new Set<() => void>()
let projection: VersionSidebarProjection = {
  repoId: null,
  repoIds: [],
  worktreeIdentities: new Set()
}
let projectionKey = ''
let focusRequest: { repoId: string; sequence: number } | null = null

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function publishVersionSidebarProjection(next: VersionSidebarProjection): void {
  const key = JSON.stringify([
    next.repoId,
    [...next.repoIds].sort(),
    [...next.worktreeIdentities].sort()
  ])
  if (key === projectionKey) {
    return
  }
  projectionKey = key
  projection = next
  emit()
}

export function requestVersionSidebarFocus(repoId: string): void {
  focusRequest = { repoId, sequence: (focusRequest?.sequence ?? 0) + 1 }
  emit()
}

/**
 * Non-React read for pipelines that run outside the sidebar tree (e.g. the
 * Cmd+1–9 ordering fallback); consumers still re-run on the next keystroke.
 */
export function getVersionSidebarProjection(): VersionSidebarProjection {
  return projection
}

export function useVersionSidebarProjection(): VersionSidebarProjection {
  return useSyncExternalStore(
    subscribe,
    () => projection,
    () => projection
  )
}

export function useVersionSidebarFocusRequest(): typeof focusRequest {
  return useSyncExternalStore(
    subscribe,
    () => focusRequest,
    () => focusRequest
  )
}
