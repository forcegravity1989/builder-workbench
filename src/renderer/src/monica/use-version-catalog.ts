import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import { versionCatalogPlanTrees } from './version-catalog-plan-trees'
import {
  loadVersionCatalog,
  type VersionCatalogLoad,
  type VersionCatalogPlanTree
} from './version-catalog-load'
import {
  nativeWorkspaceScope,
  nativeWorkspaceScopeKey,
  type NativeWorkspaceScope
} from './version-cycle/native-workspace'
import {
  collectVersionCatalogWorkspaces,
  mergeVersionCatalog
} from '../../../shared/monica/version-catalog'
import {
  versionCatalogSources,
  versionCatalogSourceKey,
  versionCatalogWorktrees,
  versionCatalogFingerprint
} from './version-catalog-source'
import { useVersionCatalogDiscovery } from './use-version-catalog-discovery'
import { useVersionPlanEntryTimes } from './use-version-plan-entry-times'
import { PrioritySemaphore } from '../../../shared/priority-semaphore'
import { createSnapshotCache, useSnapshotCache } from './snapshot-cache'

const catalogReads = new PrioritySemaphore(3)
const previousCatalogs = createSnapshotCache<VersionCatalogLoad | null>(() => null)

export type VersionCatalogState = {
  scope: NativeWorkspaceScope | null
  home: Worktree | null
  worktrees: Worktree[]
  repoIds: string[]
  planTrees: VersionCatalogPlanTree[]
  catalog: VersionCatalogLoad | null
  loading: boolean
  error: string | null
  /** Bound trees can be visible before the committed material catalog is known. */
  materialReady: boolean
  materialError: string | null
  planOrderPending: boolean
  reload: () => void
}

/** Wall, sidebar and overviews share discovery and material reads; no persisted catalog. */
export function useVersionCatalogForRepo(
  repoId: string | null,
  sourceHostId?: ExecutionHostId | null,
  revision = 0,
  registrationOnly = false
): VersionCatalogState {
  const repos = useAppStore((s) => s.repos)
  const visible = useAppStore((s) => s.worktreesByRepo)
  const detected = useAppStore((s) => s.detectedWorktreesByRepo)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const sources = useMemo(
    () =>
      versionCatalogSources(repos, repoId, sourceHostId).filter(
        (repo) => !registrationOnly || repo.id === repoId
      ),
    [repos, repoId, sourceHostId, registrationOnly]
  )
  const sourceKey = JSON.stringify([repoId, sourceHostId, versionCatalogSourceKey(sources)])
  const snapshot = previousCatalogs(sourceKey)
  const retainedCatalog = useSnapshotCache(snapshot)
  const repoIds = useMemo(() => [...new Set(sources.map((repo) => repo.id))], [sources])
  const discovery = useVersionCatalogDiscovery(sources, JSON.stringify([revision, nonce]))
  const registeredWorktrees = useMemo(
    () => versionCatalogWorktrees(repos, sources, visible, detected),
    [repos, sources, visible, detected]
  )
  const home = useMemo(() => {
    const primary = registeredWorktrees.filter((tree) => tree.repoId === repoId)
    return (
      primary.find((tree) => tree.isMainWorktree) ??
      registeredWorktrees.find((tree) => tree.isMainWorktree) ??
      primary[0] ??
      registeredWorktrees[0] ??
      null
    )
  }, [registeredWorktrees, repoId])
  const owner = useMemo(() => {
    if (!home) {
      return { scope: null, error: '未读到项目工作区，请刷新或检查主机连接。' }
    }
    try {
      return { scope: nativeWorkspaceScope(home), error: null }
    } catch (reason) {
      return { scope: null, error: reason instanceof Error ? reason.message : String(reason) }
    }
    // Native scope resolution also reads the current repo registrations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, repos])
  const { scope } = owner
  const worktrees = useMemo(
    () =>
      registeredWorktrees.filter(
        (tree) =>
          !registrationOnly || !scope || !tree.projectId || tree.projectId === scope.projectId
      ),
    [registeredWorktrees, registrationOnly, scope]
  )
  // Each plan tree resolves its owner through the same native registration lookup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const planTrees = useMemo(() => versionCatalogPlanTrees(worktrees), [worktrees, repos])
  const fingerprint = versionCatalogFingerprint(worktrees)
  const readKey = JSON.stringify([
    sourceKey,
    scope && nativeWorkspaceScopeKey(scope),
    fingerprint,
    discovery.key
  ])
  const [result, setResult] = useState<{
    key: string
    sourceKey: string
    catalog: VersionCatalogLoad | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!scope || !home || discovery.loading) {
      return
    }
    let cancelled = false
    void (async () => {
      const release = await catalogReads.acquire(0)
      try {
        if (cancelled) {
          return null
        }
        return await loadVersionCatalog({
          scope,
          homeWorktreeId: home.id,
          homeInstanceId: home.instanceId,
          planTrees,
          worktrees,
          repoIds,
          projectId: scope.projectId,
          previous: snapshot.read()
        })
      } finally {
        release()
      }
    })().then(
      (catalog) => {
        if (!cancelled && catalog) {
          const next = { key: readKey, sourceKey, catalog, error: null }
          snapshot.publish(catalog)
          setResult(next)
        }
      },
      (reason) => {
        if (!cancelled) {
          setResult({
            key: readKey,
            sourceKey,
            catalog: snapshot.read(),
            error: reason instanceof Error ? reason.message : String(reason)
          })
        }
      }
    )
    return () => {
      cancelled = true
    }
    // Content changes use the source/instance/material fingerprint, not store row references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readKey, discovery.loading])

  const currentLoad = result?.sourceKey === sourceKey ? result.catalog : retainedCatalog
  const committedVersions = useMemo(
    () =>
      currentLoad?.entries.flatMap((entry) => (entry.material.plan ? [entry.version] : [])) ?? [],
    [currentLoad]
  )
  const planOrder = useVersionPlanEntryTimes(
    scope,
    home?.id,
    currentLoad?.history?.key,
    currentLoad?.history?.baselineCommit,
    committedVersions,
    readKey
  )
  const catalog = useMemo(() => {
    const registered = mergeVersionCatalog({
      committed: { records: [], problems: [] },
      historyAvailable: currentLoad?.history?.ready ?? false,
      workspaces: collectVersionCatalogWorkspaces(worktrees, repoIds, scope?.projectId)
    })
    const registeredByVersion = new Map(registered.map((entry) => [entry.version, entry]))
    const entries = new Map<string, (typeof registered)[number]>()
    for (const entry of currentLoad?.entries ?? []) {
      const registeredEntry = registeredByVersion.get(entry.version)
      const bindings = registeredEntry?.workspaces ?? []
      const enteredAt = planOrder.times?.[entry.version]
      const hasPlanReadProblem = entry.problems.some((problem) => problem.workflow === 'plan')
      entries.set(entry.version, {
        ...entry,
        mergeStatus: entry.material.plan
          ? 'merged'
          : hasPlanReadProblem
            ? 'unknown'
            : (registeredEntry?.mergeStatus ?? entry.mergeStatus),
        planEnteredAt: entry.material.plan
          ? Number.isFinite(enteredAt)
            ? enteredAt
            : null
          : entry.planEnteredAt,
        planStartedAt: registeredEntry?.planStartedAt ?? entry.planStartedAt,
        workspaces: bindings,
        state: bindings.length > 0 ? 'working' : 'retired'
      })
    }
    for (const entry of registered) {
      if (!entries.has(entry.version)) {
        entries.set(entry.version, entry)
      }
    }
    return { ...currentLoad, entries: [...entries.values()], problems: currentLoad?.problems ?? [] }
  }, [currentLoad, planOrder.times, worktrees, repoIds, scope])
  const loading = !!repoId && (discovery.loading || (!!scope && result?.key !== readKey))
  const error = !repoId
    ? null
    : !sources.length
      ? '项目来源尚未就绪，请刷新项目目录。'
      : (discovery.error ??
        (!discovery.loading ? owner.error : null) ??
        (result?.key === readKey ? result.error : null))
  const materialError = error ?? currentLoad?.history?.error ?? null
  const historyReady = currentLoad?.history?.ready ?? false
  return useMemo(
    () => ({
      scope,
      home,
      worktrees,
      repoIds,
      planTrees,
      catalog,
      loading,
      error:
        error ??
        (!loading && !catalog.entries.length
          ? (materialError ?? catalog.problems[0]?.message ?? null)
          : null),
      materialReady: !loading && !error && historyReady,
      materialError,
      planOrderPending: planOrder.pending,
      reload
    }),
    [
      scope,
      home,
      worktrees,
      repoIds,
      planTrees,
      catalog,
      loading,
      sources.length,
      discovery.loading,
      discovery.error,
      error,
      historyReady,
      materialError,
      planOrder.pending,
      reload
    ]
  )
}
