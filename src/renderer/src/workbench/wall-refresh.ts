import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { createSnapshotCache, useSnapshotCache } from './snapshot-cache'

const refresh = createSnapshotCache(() => ({
  revision: 0,
  allRevision: 0,
  visitRevision: 0,
  repoRevisions: {} as Record<string, number>,
  refreshing: false,
  partialRefresh: false,
  updatedAt: null as string | null
}))('wall')

function repoKey(repo: Repo): string {
  return JSON.stringify([getRepoExecutionHostId(repo), repo.id, repo.path])
}

export function useWallRefresh() {
  return useSnapshotCache(refresh)
}

export function beginProjectWallVisit() {
  const current = refresh.read()
  const revision = current.revision + 1
  refresh.publish({ ...current, revision, visitRevision: revision })
}

export function wallReadRevision(state: ReturnType<typeof useWallRefresh>, rows: readonly Repo[]) {
  return Math.max(state.allRevision, ...rows.map((repo) => state.repoRevisions[repoKey(repo)] ?? 0))
}

export function invalidateWallRepo(repo: Repo) {
  const current = refresh.read()
  const revision = current.revision + 1
  refresh.publish({
    ...current,
    revision,
    repoRevisions: { ...current.repoRevisions, [repoKey(repo)]: revision }
  })
}

export function refreshProjectWall(): Promise<void> {
  if (refresh.pending) {
    return refresh.pending
  }
  refresh.publish({ ...refresh.read(), refreshing: true, partialRefresh: false })
  refresh.pending = Promise.resolve()
    .then(async () => {
      let partialRefresh = false
      const store = useAppStore.getState()
      await Promise.all([
        store.fetchReposForAllHosts({
          onRepoCatalogError: () => {
            partialRefresh = true
          }
        }),
        store.fetchProjectGroupsForAllHosts()
      ])
      await store.fetchAllWorktrees()
      const current = refresh.read()
      const revision = current.revision + 1
      refresh.publish({
        ...current,
        revision,
        allRevision: revision,
        repoRevisions: {},
        refreshing: false,
        partialRefresh,
        updatedAt: new Date().toLocaleTimeString()
      })
    })
    .catch((error: unknown) => {
      refresh.publish({ ...refresh.read(), refreshing: false, partialRefresh: true })
      toast.error(String(error))
    })
    .finally(() => {
      refresh.pending = null
    })
  return refresh.pending
}
