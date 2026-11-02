import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { VersionCatalogState } from './use-version-catalog'
import { milestoneSourceCache, milestoneSourceKey, readMilestones } from './milestone-port'

/** Read the shared formal source only; local editing and recovery state never supply widths. */
export function useMilestoneSource(catalog: VersionCatalogState, refreshToken: number) {
  const scope =
    catalog.scope && catalog.home ? { ...catalog.scope, worktreeId: catalog.home.id } : null
  const key = scope ? milestoneSourceKey(scope) : 'unavailable'
  const previous = useRef(refreshToken)
  const state = useSyncExternalStore(
    (listener) => milestoneSourceCache.subscribe(key, listener),
    () => milestoneSourceCache.get(key)
  )
  useEffect(() => {
    if (!scope) {
      return
    }
    const force = previous.current !== refreshToken
    previous.current = refreshToken
    // Failure is published by the shared cache; the version screen retains its source context.
    void readMilestones(scope, force).catch(() => {})
    // The key includes repository, worktree and execution owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshToken])
  return { formal: state.value?.formal, error: state.error, loading: state.loading }
}
