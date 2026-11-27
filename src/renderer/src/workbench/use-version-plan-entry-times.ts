import { useEffect } from 'react'
import { PrioritySemaphore } from '../../../shared/concurrency/priority-semaphore'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { nativeVersionHistoryPort } from './version-history-port'
import { createSnapshotCache, useSnapshotCache } from './snapshot-cache'

const snapshots = createSnapshotCache<Record<string, number> | null>(() => null)
const historyReads = new PrioritySemaphore(3)

export function useVersionPlanEntryTimes(
  scope: NativeWorkspaceScope | null,
  worktreeId: string | undefined,
  historyKey: string | undefined,
  baselineCommit: string | undefined,
  versions: readonly string[],
  readKey: string
) {
  const key =
    scope && worktreeId && baselineCommit && versions.length
      ? JSON.stringify([historyKey, baselineCommit])
      : ''
  const snapshot = snapshots(key)
  const times = useSnapshotCache(snapshot)

  useEffect(() => {
    if (!key || !scope || !worktreeId || !baselineCommit || snapshot.pending) {
      return
    }
    const cached = snapshot.read()
    if (cached && versions.every((version) => Number.isFinite(cached[version]))) {
      return
    }
    snapshot.pending = (async () => {
      const release = await historyReads.acquire(0)
      try {
        const result = await nativeVersionHistoryPort(
          scope.runtimeOwnerEnvironmentId
        ).listPlanEntryTimes({
          scope: { repoId: scope.repoId, worktreeId, hostId: scope.hostId },
          baselineCommit
        })
        snapshot.publish({ ...cached, ...result })
      } catch {
        snapshot.publish(cached ?? {})
      } finally {
        release()
        snapshot.pending = null
      }
    })()
    // The read key changes on an explicit refresh, allowing an unavailable lookup to retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readKey, versions])

  return { times, pending: !!key && times === null }
}
