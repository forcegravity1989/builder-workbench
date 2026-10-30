import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { dismissRuntimeDisconnectedToast } from './runtime-environment-disconnect-toast'
import { advanceRuntimeEnvironmentConnectionGeneration } from './runtime-status-connection-generation'
import { advanceRuntimeRepoCatalogEpoch } from '../repos/runtime-repo-catalog-epoch'

export function withoutRuntimeRepoCatalogs(
  catalogs: AppState['runtimeRepoCatalogIdsByHost'] | undefined,
  environmentIds: Iterable<string>
): AppState['runtimeRepoCatalogIdsByHost'] | undefined {
  const ids = [...environmentIds]
  ids.forEach(advanceRuntimeRepoCatalogEpoch)
  if (!catalogs) {
    return undefined
  }
  let next = catalogs
  for (const id of ids) {
    const hostId = `runtime:${id}`
    if (Object.hasOwn(next, hostId)) {
      if (next === catalogs) {
        next = { ...catalogs }
      }
      delete next[hostId]
    }
  }
  return next
}

type Set = Parameters<StateCreator<AppState>>[0]
type Get = Parameters<StateCreator<AppState>>[1]

export function clearRuntimeStatus(set: Set, environmentId: string): void {
  dismissRuntimeDisconnectedToast(environmentId)
  set((s) => {
    advanceRuntimeEnvironmentConnectionGeneration(environmentId)
    const runtimeRepoCatalogIdsByHost = withoutRuntimeRepoCatalogs(s.runtimeRepoCatalogIdsByHost, [
      environmentId
    ])
    if (
      !s.runtimeStatusByEnvironmentId.has(environmentId) &&
      runtimeRepoCatalogIdsByHost === s.runtimeRepoCatalogIdsByHost
    ) {
      return s
    }
    const next = new Map(s.runtimeStatusByEnvironmentId)
    next.delete(environmentId)
    return {
      runtimeStatusByEnvironmentId: next,
      ...(runtimeRepoCatalogIdsByHost !== s.runtimeRepoCatalogIdsByHost
        ? { runtimeRepoCatalogIdsByHost }
        : {})
    }
  })
}

export function retainRuntimeStatuses(set: Set, get: Get, environmentIds: Iterable<string>): void {
  const keep = new Set(environmentIds)
  for (const id of get().runtimeStatusByEnvironmentId.keys()) {
    if (!keep.has(id)) {
      dismissRuntimeDisconnectedToast(id)
    }
  }
  set((s) => {
    let changed = false
    const next = new Map(s.runtimeStatusByEnvironmentId)
    const removedIds: string[] = []
    for (const id of next.keys()) {
      if (!keep.has(id)) {
        next.delete(id)
        removedIds.push(id)
        changed = true
      }
    }
    const runtimeRepoCatalogIdsByHost = withoutRuntimeRepoCatalogs(
      s.runtimeRepoCatalogIdsByHost,
      removedIds
    )
    return changed ? { runtimeStatusByEnvironmentId: next, runtimeRepoCatalogIdsByHost } : s
  })
}
