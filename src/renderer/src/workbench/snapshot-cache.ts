import { useSyncExternalStore } from 'react'

/** One keyed snapshot: `pending` coalesces loads (one in flight per key),
 * `publish` replaces the value and notifies subscribers. */
export type SnapshotEntry<T> = {
  pending: Promise<void> | null
  read(): T
  publish(next: T): void
  subscribe(listener: () => void): () => void
  subscribed(): boolean
}

/** Renderer-lifetime snapshots survive page navigation; only a load replaces them,
 * and they die with the renderer so a restart recomputes everything. Shared
 * primitive: overview zones and cycle task reads (version-cycle/use-cycle-task-reads). */
export function createSnapshotCache<T>(initial: () => T) {
  const entries = new Map<string, SnapshotEntry<T>>()
  function createEntry(): SnapshotEntry<T> {
    let value = initial()
    const listeners = new Set<() => void>()
    return {
      pending: null,
      subscribed: () => listeners.size > 0,
      read: () => value,
      publish(next: T) {
        value = next
        for (const listener of listeners) {
          listener()
        }
      },
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }
    }
  }
  return (key: string) => {
    let entry = entries.get(key)
    if (!entry) {
      entry = createEntry()
      entries.set(key, entry)
      for (const [oldKey, oldEntry] of entries) {
        if (entries.size <= 32) {
          break
        }
        if (oldKey !== key && !oldEntry.pending && !oldEntry.subscribed()) {
          entries.delete(oldKey)
        }
      }
    }
    return entry
  }
}

export function useSnapshotCache<T>(entry: {
  read(): T
  subscribe(listener: () => void): () => void
}) {
  return useSyncExternalStore(entry.subscribe, entry.read)
}
