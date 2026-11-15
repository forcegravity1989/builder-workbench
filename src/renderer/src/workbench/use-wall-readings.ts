import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { resolveProjectSource } from './project-source-resolution'
import { useVersionCatalogForRepo } from './use-version-catalog'
import { readWallReadings } from './wall-readings-load'
import type { WallCardReadings } from './wall-card-readings'
import { versionCatalogSourceKey, versionCatalogFingerprint } from './version-catalog-source'
import { type useWallRefresh, wallReadRevision } from './wall-refresh'
import { PrioritySemaphore } from '../../../shared/priority-semaphore'

const progressReads = new PrioritySemaphore(3)

export function useWallReadings(repo: Repo, refresh: ReturnType<typeof useWallRefresh>) {
  const source = useAppStore((state) => resolveProjectSource(state, repo))
  const sourceKey = source ? versionCatalogSourceKey([source]) : null
  const revision = Math.max(
    refresh.visitRevision,
    wallReadRevision(refresh, source ? [source] : [repo])
  )
  const catalog = useVersionCatalogForRepo(
    source?.kind === 'folder' ? null : (source?.id ?? null),
    source ? getRepoExecutionHostId(source) : null,
    revision
  )
  const [result, setResult] = useState<{
    key: string
    sourceKey: string | null
    readings: WallCardReadings
  } | null>(null)
  const forcedRevision = useRef(0)
  const key = JSON.stringify([
    sourceKey,
    catalog.catalog,
    catalog.scope,
    versionCatalogFingerprint(catalog.worktrees),
    catalog.loading,
    catalog.error,
    catalog.materialReady,
    catalog.materialError,
    revision
  ])
  useEffect(() => {
    if (!source || source.kind === 'folder' || catalog.loading) {
      return
    }
    let cancelled = false
    void (async () => {
      const release = await progressReads.acquire(0)
      try {
        return cancelled
          ? null
          : await readWallReadings(catalog, refresh.allRevision > forcedRevision.current)
      } finally {
        release()
      }
    })().then((readings) => {
      if (!cancelled && readings) {
        forcedRevision.current = refresh.allRevision
        setResult({ key, sourceKey, readings })
      }
    })
    return () => {
      cancelled = true
    }
    // The key includes catalog content; row reference churn must not refetch provider facts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const readings: WallCardReadings =
    repo.kind === 'folder'
      ? { kind: 'empty' }
      : !source
        ? { kind: 'unknown', reason: '项目来源尚未就绪，请检查主机连接后刷新。' }
        : result?.sourceKey === sourceKey
          ? result.readings
          : { kind: 'loading' }
  return {
    source,
    readings,
    refreshing: !!source && source.kind !== 'folder' && (catalog.loading || result?.key !== key),
    failed:
      !!catalog.error ||
      !!catalog.materialError ||
      readings.kind === 'unknown' ||
      (catalog.catalog?.problems.length ?? 0) > 0
  }
}
