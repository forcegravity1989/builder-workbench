import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { VersionCatalogState } from './use-version-catalog'
import { milestoneSourceCache, milestoneSourceKey, readMilestones } from './milestone-port'

/** Read the shared formal source only; local editing and recovery state never supply widths. */
export function useMilestoneSource(
  catalog: VersionCatalogState,
  refreshToken: number,
  enabled: boolean
) {
  const scope =
    enabled && catalog.scope && catalog.home
      ? { ...catalog.scope, worktreeId: catalog.home.id }
      : null
  const key = scope ? milestoneSourceKey(scope) : 'unavailable'
  const previous = useRef<{ key: string; refreshToken: number } | null>(null)
  const state = useSyncExternalStore(
    (listener) => milestoneSourceCache.subscribe(key, listener),
    () => milestoneSourceCache.get(key)
  )
  useEffect(() => {
    if (!scope) {
      previous.current = null
      return
    }
    const force =
      previous.current?.key === key
        ? previous.current.refreshToken !== refreshToken
        : Boolean(milestoneSourceCache.get(key).value)
    previous.current = { key, refreshToken }
    // Failure is published by the shared cache; the version screen retains its source context.
    void readMilestones(scope, force).catch(() => {})
    // The key includes repository, worktree and execution owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshToken])
  return { formal: state.value?.formal, error: state.error, loading: state.loading }
}
