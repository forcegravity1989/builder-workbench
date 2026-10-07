import { useSyncExternalStore } from 'react'

/** Renderer-lifetime snapshots survive page navigation; only an explicit load replaces them. */
export function createOverviewSnapshotCache<T>(initial: () => T) {
  const entries = new Map<string, ReturnType<typeof createEntry>>()
  function createEntry() {
    let value = initial()
    const listeners = new Set<() => void>()
    return {
      pending: null as Promise<void> | null,
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

export function useOverviewSnapshot<T>(entry: {
  read(): T
  subscribe(listener: () => void): () => void
}) {
  return useSyncExternalStore(entry.subscribe, entry.read)
}
