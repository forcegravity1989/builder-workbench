import { useCallback, useSyncExternalStore } from 'react'

export type OverviewViewState = {
  version: string | null
  feature: string | null
  granularity: 'day' | 'week'
}
const empty: OverviewViewState = {
  version: null,
  feature: null,
  granularity: 'week'
}
const cache = new Map<string, OverviewViewState>()
const listeners = new Set<() => void>()
function read(key: string): OverviewViewState {
  const cached = cache.get(key)
  if (cached) {
    return cached
  }
  let value = empty
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(`bw:overview:${key}`) ?? 'null'
    ) as Partial<OverviewViewState> | null
    if (saved && typeof saved === 'object') {
      value = {
        version: typeof saved.version === 'string' ? saved.version : null,
        feature: typeof saved.feature === 'string' ? saved.feature : null,
        granularity: saved.granularity === 'day' ? 'day' : 'week'
      }
    }
  } catch {
    /* View preferences are optional when storage is unavailable. */
  }
  cache.set(key, value)
  return value
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function useOverviewViewState(identity: string) {
  const snapshot = useCallback(() => read(identity), [identity])
  const value = useSyncExternalStore(subscribe, snapshot)
  const update = useCallback(
    (patch: Partial<OverviewViewState>) => {
      const next = { ...read(identity), ...patch }
      cache.set(identity, next)
      try {
        sessionStorage.setItem(`bw:overview:${identity}`, JSON.stringify(next))
      } catch {
        /* Optional view preferences. */
      }
      for (const listener of listeners) {
        listener()
      }
    },
    [identity]
  )
  return [value, update] as const
}
