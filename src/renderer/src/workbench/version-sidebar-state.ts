import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'

export type VersionSidebarProjection = {
  repoId: string | null
  worktreeIdentities: ReadonlySet<string>
}

/** One "reveal this version-bound tree in the version tree" request (#762). */
export type VersionTreeWorktreeRevealRequest = {
  repoId: string
  version: string
  worktreeIdentity: string
  highlight: boolean
  sequence: number
}

const listeners = new Set<() => void>()
let projection: VersionSidebarProjection = {
  repoId: null,
  worktreeIdentities: new Set()
}
let projectionKey = ''
let focusSequence = 0
let focusRequest: { repoId: string; sequence: number } | null = null
type NavigationReveal = { rowKey: string; version: string; guide: boolean; sequence: number }
let navigationReveal: NavigationReveal | null = null
let endNavigationReveal: (() => void) | undefined

export function revealNavigationVersion(rowKey: string, version: string, guide: boolean): void {
  endNavigationReveal?.()
  navigationReveal = { rowKey, version, guide, sequence: ++focusSequence }
  let started = false
  const end = () => {
    unsubscribe()
    window.clearTimeout(timer)
    navigationReveal = null
    endNavigationReveal = undefined
    emit()
  }
  const timer = guide
    ? window.setTimeout(() => {
        if (!started) {
          end()
        }
      }, 8500)
    : undefined
  const unsubscribe = useAppStore.subscribe((next, previous) => {
    if (
      next.activeView !== previous.activeView ||
      next.activeWorktreeId !== previous.activeWorktreeId ||
      next.activeWorkspaceExecutionHostId !== previous.activeWorkspaceExecutionHostId ||
      (started && next.activeContextualTourId !== 'workbench-versions')
    ) {
      end()
    } else if (
      guide &&
      next.activeContextualTourId === 'workbench-versions' &&
      previous.activeContextualTourId !== next.activeContextualTourId
    ) {
      started = true
    }
  })
  endNavigationReveal = end
  emit()
}

export function clearNavigationVersion(): void {
  endNavigationReveal?.()
}

export function useNavigationVersion(rowKey: string): NavigationReveal | null {
  const reveal = useSyncExternalStore(
    subscribe,
    () => navigationReveal,
    () => null
  )
  return reveal?.rowKey === rowKey ? reveal : null
}
let treeRevealSequence = 0
let treeRevealRequest: VersionTreeWorktreeRevealRequest | null = null

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
  const key = JSON.stringify([next.repoId, [...next.worktreeIdentities].sort()])
  if (key === projectionKey) {
    return
  }
  projectionKey = key
  projection = next
  emit()
}

export function requestVersionSidebarFocus(repoId: string): void {
  clearNavigationVersion()
  focusRequest = { repoId, sequence: ++focusSequence }
  emit()
}

export function consumeVersionSidebarFocus(sequence: number): void {
  if (focusRequest?.sequence === sequence) {
    focusRequest = null
    emit()
  }
}

export function requestVersionTreeWorktreeReveal(
  request: Omit<VersionTreeWorktreeRevealRequest, 'sequence'>
): void {
  treeRevealRequest = { ...request, sequence: ++treeRevealSequence }
  emit()
}

/** Single consumer clears on success or retry exhaustion; stale sequences are ignored. */
export function consumeVersionTreeWorktreeReveal(sequence: number): void {
  if (treeRevealRequest?.sequence === sequence) {
    treeRevealRequest = null
    emit()
  }
}

/** Non-React sidebar-order consumers read the latest projection on each keystroke. */
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

export function useVersionTreeWorktreeRevealRequest(): VersionTreeWorktreeRevealRequest | null {
  return useSyncExternalStore(
    subscribe,
    () => treeRevealRequest,
    () => treeRevealRequest
  )
}
