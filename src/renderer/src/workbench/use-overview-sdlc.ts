import { useCallback, useEffect, useMemo } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import {
  sdlcProviderOf,
  type SdlcCommits,
  type SdlcSeries,
  type SdlcSnapshot
} from './overview-sdlc'
import { readSdlcCommits, readSdlcRemote } from './overview-sdlc-readings'
import { zoneChartRange } from './overview-zone-series'
import { createOverviewSnapshotCache, useOverviewSnapshot } from './overview-snapshot-cache'

const cache = createOverviewSnapshotCache(() => ({
  commits: null as SdlcSeries<SdlcCommits> | null,
  merges: null as SdlcSeries<SdlcCommits> | null,
  issues: null as SdlcSeries<SdlcSnapshot> | null,
  anchor: new Date().toISOString(),
  busy: false,
  loaded: false
}))
function retain<T>(next: SdlcSeries<T> | null, old: SdlcSeries<T> | null): SdlcSeries<T> | null {
  return next?.kind === 'error'
    ? { ...next, previous: old?.kind === 'ready' ? old.value : old?.previous }
    : next
}

export function useOverviewSdlc(args: {
  repo: Repo | null
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  baseWorktreePath: string | null
  timezone: string
  ready: boolean
  /** Bumped by the「更新代码」button so its snapshot re-reads after a fast-forward. */
  refreshToken: number
}) {
  const { repo, baseScope, baseWorktreeId, baseWorktreePath, timezone, ready, refreshToken } = args
  const provider = sdlcProviderOf(repo)
  const key = JSON.stringify([
    repo?.id,
    repo?.path,
    repo?.connectionId,
    repo?.gitRemoteIdentity,
    repo?.upstream,
    baseScope,
    baseWorktreeId,
    baseWorktreePath,
    timezone,
    refreshToken
  ])
  const entry = useMemo(() => cache(key), [key])
  const snapshot = useOverviewSnapshot(entry)
  const load = useCallback(
    (force = false) => {
      if (
        !ready ||
        !repo ||
        !baseScope ||
        !baseWorktreeId ||
        !baseWorktreePath ||
        entry.pending ||
        (!force && entry.read().loaded)
      ) {
        return
      }
      const anchor = new Date().toISOString()
      // Five weeks cover both chart spans. Fetch native events once, then bucket locally.
      const range = zoneChartRange('week', timezone, anchor)
      entry.publish({ ...entry.read(), busy: true })
      entry.pending = (async () => {
        const [commits, merges, issues] = await Promise.all([
          readSdlcCommits({
            ownerEnvironmentId: baseScope.runtimeOwnerEnvironmentId,
            worktreeId: baseWorktreeId,
            worktreePath: baseWorktreePath,
            range,
            current: () => true
          }),
          provider ? readSdlcRemote(repo, provider, 'pr', range, () => true) : null,
          provider ? readSdlcRemote(repo, provider, 'issue', range, () => true) : null
        ])
        const old = entry.read()
        entry.publish({
          commits: retain(commits, old.commits),
          merges: retain(merges, old.merges),
          issues: retain(issues, old.issues),
          anchor,
          busy: false,
          loaded: true
        })
      })().finally(() => {
        entry.pending = null
      })
    },
    [repo, baseScope, baseWorktreeId, baseWorktreePath, timezone, provider, entry, ready]
  )
  useEffect(() => {
    load()
  }, [load])
  return { ...snapshot, provider }
}
