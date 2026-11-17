import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { Repo } from '../../../shared/repo-types'
import { resolveProjectSource } from './project-source-resolution'
import { useProjectVersionCatalog, versionCatalogErrors } from './project-version-catalog'
import { readWallReadings } from './wall-readings-load'
import type { WallCardReadings } from './wall-card-readings'
import { versionCatalogSourceKey, versionCatalogFingerprint } from './version-catalog-source'
import { wallReadRevision, type useWallRefresh } from './wall-refresh'
import { PrioritySemaphore } from '../../../shared/priority-semaphore'
import { createSnapshotCache, useSnapshotCache } from './snapshot-cache'

const progressReads = new PrioritySemaphore(3)
const displaySnapshots = createSnapshotCache<{
  key: string
  readings: WallCardReadings
  forcedRevision: number
} | null>(() => null)

export function useWallReadings(repo: Repo, refresh: ReturnType<typeof useWallRefresh>) {
  const source = useAppStore((state) => resolveProjectSource(state, repo))
  const project = useProjectVersionCatalog(source, refresh)
  const version = project.planOrderPending ? undefined : project.versions[0]
  const selected = version?.source
  const catalog = selected?.state
  const refreshRevision = selected
    ? wallReadRevision(refresh, [selected.repo])
    : refresh.allRevision
  const revision = Math.max(refresh.visitRevision, refreshRevision)
  const sourceKey =
    selected && version
      ? JSON.stringify([versionCatalogSourceKey([selected.repo]), version.entry.version])
      : null
  const snapshot = displaySnapshots(sourceKey ?? '')
  const result = useSnapshotCache(snapshot)
  const key = JSON.stringify([
    sourceKey,
    catalog?.catalog,
    catalog?.scope,
    catalog ? versionCatalogFingerprint(catalog.worktrees) : null,
    catalog?.loading,
    catalog?.error,
    catalog?.materialReady,
    catalog?.materialError,
    revision
  ])
  useEffect(() => {
    if (!catalog || !version || catalog.loading) {
      return
    }
    let cancelled = false
    void (async () => {
      const release = await progressReads.acquire(0)
      try {
        return cancelled
          ? null
          : await readWallReadings(
              catalog,
              version.entry.version,
              refreshRevision > (snapshot.read()?.forcedRevision ?? 0)
            )
      } finally {
        release()
      }
    })().then((readings) => {
      if (!cancelled && readings) {
        snapshot.publish({ key, readings, forcedRevision: refreshRevision })
      }
    })
    return () => {
      cancelled = true
    }
    // The key includes catalog content; row reference churn must not refetch provider facts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const reason = catalog ? versionCatalogErrors(catalog)[0] : project.sourceProblems[0]?.errors[0]
  const readings: WallCardReadings =
    repo.kind === 'folder'
      ? { kind: 'empty' }
      : !source
        ? { kind: 'unknown', reason: '项目来源尚未就绪，请检查主机连接后刷新。' }
        : catalog
          ? (result?.readings ?? { kind: 'loading' })
          : project.loading || project.planOrderPending
            ? { kind: 'loading' }
            : reason || version || !project.primary?.materialReady
              ? {
                  kind: 'unknown',
                  version: version?.entry.version,
                  reason: reason ?? '版本资料来源尚未就绪，请打开侧栏核对。'
                }
              : { kind: 'empty' }
  return {
    source,
    versionSource: selected?.repo,
    catalogReaders: project.catalogReaders,
    readings,
    refreshing:
      !!source &&
      source.kind !== 'folder' &&
      (catalog
        ? catalog.loading || result?.key !== key
        : project.loading || project.planOrderPending),
    failed: !!reason || readings.kind === 'unknown'
  }
}
