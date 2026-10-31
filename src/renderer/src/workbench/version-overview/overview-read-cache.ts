export type ReadSnapshot<T> = { value?: T; loading: boolean; error?: string }

/** Source keys include ownership and revisions. Consumers share both in-flight reads and refreshes. */
export function createOverviewReadCache<T>(retain: (next: T, previous?: T) => T) {
  const snapshots = new Map<string, ReadSnapshot<T>>()
  const pending = new Map<string, Promise<void>>()
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
        }
      }
    },
    read(key: string, load: () => Promise<T>, force = false) {
      const running = pending.get(key)
      if (running) {
        return running
      }
      const previous = get(key).value
      if (!force && previous) {
        return Promise.resolve()
      }
      publish(key, { value: previous, loading: true })
      const request = Promise.resolve()
        .then(load)
        .then((next) => {
          publish(key, { value: retain(next, previous), loading: false })
        })
        .catch((reason) => {
          publish(key, {
            value: previous,
            loading: false,
            error: reason instanceof Error ? reason.message : String(reason)
          })
        })
        .finally(() => {
          pending.delete(key)
        })
      pending.set(key, request)
      return request
    }
  }
}
