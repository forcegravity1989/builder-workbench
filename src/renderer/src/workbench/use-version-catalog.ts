import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from '../../../shared/workbench/version-catalog'
import {
  versionCatalogSources,
  versionCatalogSourceKey,
  versionCatalogWorktrees,
  versionCatalogFingerprint
} from './version-catalog-source'
import { useVersionCatalogDiscovery } from './use-version-catalog-discovery'
import { PrioritySemaphore } from '../../../shared/priority-semaphore'

const catalogReads = new PrioritySemaphore(3)

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
  reload: () => void
}

/** Wall, sidebar and overviews share discovery and material reads; no persisted catalog. */
export function useVersionCatalogForRepo(
  repoId: string | null,
  sourceHostId?: ExecutionHostId | null,
  revision = 0
): VersionCatalogState {
  const repos = useAppStore((s) => s.repos)
  const visible = useAppStore((s) => s.worktreesByRepo)
  const detected = useAppStore((s) => s.detectedWorktreesByRepo)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])
  // No host restriction is reserved for cross-host binding/cleanup consumers.
  const sources = useMemo(
    () => versionCatalogSources(repos, repoId, sourceHostId),
    [repos, repoId, sourceHostId]
  )
  const sourceKey = JSON.stringify([repoId, sourceHostId, versionCatalogSourceKey(sources)])
  const repoIds = useMemo(() => [...new Set(sources.map((repo) => repo.id))], [sources])
  const discovery = useVersionCatalogDiscovery(sources, JSON.stringify([revision, nonce]))
  const worktrees = useMemo(
    () => versionCatalogWorktrees(repos, sources, visible, detected),
    [repos, sources, visible, detected]
  )
  const home = useMemo(() => {
    const primary = worktrees.filter((tree) => tree.repoId === repoId)
    return (
      primary.find((tree) => tree.isMainWorktree) ??
      worktrees.find((tree) => tree.isMainWorktree) ??
      primary[0] ??
      worktrees[0] ??
      null
    )
  }, [worktrees, repoId])
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
  const previous = useRef<typeof result>(null)

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
          previous: previous.current?.sourceKey === sourceKey ? previous.current.catalog : null
        })
      } finally {
        release()
      }
    })().then(
      (catalog) => {
        if (!cancelled && catalog) {
          const next = { key: readKey, sourceKey, catalog, error: null }
          previous.current = next
          setResult(next)
        }
      },
      (reason) => {
        if (!cancelled) {
          setResult({
            key: readKey,
            sourceKey,
            catalog: previous.current?.sourceKey === sourceKey ? previous.current.catalog : null,
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

  const currentLoad = result?.sourceKey === sourceKey ? result.catalog : null
  const catalog = useMemo(() => {
    const registered = mergeVersionCatalog({
      committed: { records: [], problems: [] },
      workspaces: collectVersionCatalogWorkspaces(worktrees, repoIds, scope?.projectId)
    })
    const entries = new Map(registered.map((entry) => [entry.version, entry]))
    for (const entry of currentLoad?.entries ?? []) {
      const bindings = entries.get(entry.version)?.workspaces ?? []
      entries.set(entry.version, {
        ...entry,
        workspaces: bindings,
        state: bindings.length > 0 ? 'working' : 'retired'
      })
    }
    return { ...currentLoad, entries: [...entries.values()], problems: currentLoad?.problems ?? [] }
  }, [currentLoad, worktrees, repoIds, scope])
  const loading = !!repoId && (discovery.loading || (!!scope && result?.key !== readKey))
  const error = !repoId
    ? null
    : !sources.length
      ? '项目来源尚未就绪，请刷新项目目录。'
      : (discovery.error ??
        (!discovery.loading ? owner.error : null) ??
        (result?.key === readKey ? result.error : null))
  const materialError = error ?? currentLoad?.history?.error ?? null
  return {
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
    materialReady: !loading && !error && (currentLoad?.history?.ready ?? false),
    materialError,
    reload
  }
}
