export type ReadSnapshot<T> = { value?: T; loading: boolean; error?: string }

/** Source keys include ownership and revisions. Consumers share in-flight reads and refreshes. */
export function createOverviewReadCache<T>(
  retain: (next: T, previous?: T) => T,
  cancelWhenUnused = false
) {
  const snapshots = new Map<string, ReadSnapshot<T>>()
  const pending = new Map<string, { promise: Promise<void>; controller: AbortController }>()
  const listeners = new Map<string, Set<() => void>>()
  const empty: ReadSnapshot<T> = { loading: false }
  const get = (key: string) => snapshots.get(key) ?? empty
  const publish = (key: string, value: ReadSnapshot<T>) => {
    snapshots.set(key, value)
    listeners.get(key)?.forEach((listener) => listener())
  }
  return {
    get,
    subscribe(key: string, listener: () => void) {
      const group = listeners.get(key) ?? new Set<() => void>()
      group.add(listener)
      listeners.set(key, group)
      return () => {
        group.delete(listener)
        if (!group.size) {
          listeners.delete(key)
          // React can re-subscribe within one commit. Only cancel after the last consumer leaves.
          if (cancelWhenUnused) {
            queueMicrotask(() => {
              if (!listeners.has(key)) {
                pending.get(key)?.controller.abort()
                pending.delete(key)
                const previous = get(key)
                snapshots.set(key, { ...previous, loading: false })
              }
            })
          }
        }
      }
    },
    read(key: string, load: (signal: AbortSignal) => Promise<T>, force = false) {
      const running = pending.get(key)
      if (running) {
        return running.promise
      }
      const previous = get(key).value
      if (!force && previous) {
        return Promise.resolve()
      }
      const controller = new AbortController()
      const { signal } = controller
      publish(key, { value: previous, loading: true })
      const promise = Promise.resolve()
        .then(() => {
          signal.throwIfAborted()
          return load(signal)
        })
        .then((next) => {
          if (!signal.aborted) {
            publish(key, { value: retain(next, previous), loading: false })
          }
        })
        .catch((reason) => {
          if (!signal.aborted) {
            publish(key, {
              value: previous,
              loading: false,
              error: reason instanceof Error ? reason.message : String(reason)
            })
          }
        })
        .finally(() => {
          if (pending.get(key)?.controller === controller) {
            pending.delete(key)
          }
        })
      pending.set(key, { promise, controller })
      return promise
    }
  }
}
