import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import {
  worktreeHostMatchOptions,
  worktreeMatchesHost
} from '@/store/slices/worktrees/listing/worktree-host-ownership'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { versionCatalogPlanTrees } from './version-catalog-plan-trees'
import { versionRepoIdentity as identityKeyOf } from '../../../shared/workbench/version-repo-identity'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import {
  loadVersionCatalog,
  type VersionCatalogLoad,
  type VersionCatalogPlanTree
} from './version-catalog-load'
import { nativeWorkspaceScope, type NativeWorkspaceScope } from './version-cycle/native-workspace'
import { worktreeFingerprintTuple } from './worktree-fingerprint'
import {
  collectVersionCatalogWorkspaces,
  mergeVersionCatalog
} from '../../../shared/workbench/version-catalog'

/**
 * 侧栏版本树的目录装载（G2 P3a）：目录=现算（绑定从原生登记、材料从主干与
 * 计划树），本 hook 只做读取编排与失败如实上报，不落任何目录副本。
 * 计划树入口集=各版绑定计划树＋旧固定树（旧上下文显式保留）。
 */

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

export function useVersionCatalogForRepo(
  repoId: string | null,
  sourceHostId?: ExecutionHostId | null
): VersionCatalogState {
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const detectedWorktreesByRepo = useAppStore((s) => s.detectedWorktreesByRepo)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  // 同项目跨宿主注册行（配对机同仓）一并纳入绑定汇总，沿远端身份归并。
  // 版本总览传入来源主机时只看这台主机：本机有项目但没该版本，不去远端补。
  const repoIds = useMemo(() => {
    if (!repoId) {
      return []
    }
    const target = findRepoForHost(repos, repoId, { hostId: sourceHostId })
    if (!target && sourceHostId) {
      return []
    }
    const key = target ? identityKeyOf(target) : null
    if (!key) {
      return [repoId]
    }
    const ids = repos
      .filter((repo) => identityKeyOf(repo) === key)
      .filter((repo) => !sourceHostId || getRepoExecutionHostId(repo) === sourceHostId)
      .map((repo) => repo.id)
    return ids.includes(repoId) ? ids : [repoId, ...ids]
  }, [repoId, repos, sourceHostId])
  const repoIdsKey = repoIds.join(',')

  const worktrees = useMemo(() => {
    const rows = new Map<string, Worktree>()
    for (const id of repoIds) {
      const options = sourceHostId
        ? worktreeHostMatchOptions({ repos }, id, sourceHostId)
        : undefined
      // 检测到但未显示的树也可能持有有效绑定。
      const candidates = [
        ...(worktreesByRepo[id] ?? []),
        ...(detectedWorktreesByRepo[id]?.worktrees ?? [])
      ]
      for (const tree of candidates) {
        if (!sourceHostId || worktreeMatchesHost(tree, sourceHostId, options)) {
          rows.set(getWorktreeHostIdentity(tree), tree)
        }
      }
    }
    return [...rows.values()]
  }, [repoIdsKey, worktreesByRepo, detectedWorktreesByRepo, repos, sourceHostId]) // eslint-disable-line react-hooks/exhaustive-deps

  const home = useMemo(() => {
    const primary = worktrees.filter((tree) => tree.repoId === repoId)
    return (
      primary.find((tree) => tree.isMainWorktree) ??
      primary[0] ??
      worktrees.find((tree) => tree.isMainWorktree) ??
      worktrees[0] ??
      null
    )
  }, [worktrees, repoId])

  const scope = useMemo(() => {
    if (!home) {
      return null
    }
    try {
      return nativeWorkspaceScope(home)
    } catch {
      return null
    }
  }, [home])

  const planTrees = useMemo(() => versionCatalogPlanTrees(worktrees), [worktrees])

  const [catalog, setCatalog] = useState<VersionCatalogLoad | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastView = useRef<{
    repoId: string | null
    scopeKey: string
    sourceHostId: ExecutionHostId | null | undefined
    catalog: VersionCatalogLoad
  } | null>(null)

  // 登记变化（绑定写入/删树/实例更换）用指纹触发重读；目录永远是现算。
  // 单树元组与墙卡版本链共用 worktreeFingerprintTuple；此处按 worktrees 原序
  // 连接、不排序（顺序变化也视为失效，与墙侧的排序无关键语义不同）。
  const fingerprint = useMemo(
    () =>
      JSON.stringify(
        worktrees.map((tree) => [
          worktreeFingerprintTuple(tree),
          tree.repoId,
          tree.hostId,
          tree.runtimeOwnerEnvironmentId ?? ''
        ])
      ),
    [worktrees]
  )
  const homeId = home?.id ?? null
  const scopeKey = scope
    ? JSON.stringify([
        scope.projectId,
        scope.repoId,
        scope.hostId,
        scope.runtimeOwnerEnvironmentId ?? ''
      ])
    : null
  useEffect(() => {
    if (!scope || !homeId) {
      if (lastView.current?.repoId !== repoId || lastView.current?.sourceHostId !== sourceHostId) {
        setCatalog(null)
      }
      // scope 失效也要复位上一轮的装载/错误态：在飞轮次被 cleanup 取消后其
      // finally 不再落地，否则「读取中」或旧错误横幅永久残留到 scope 恢复。
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const load = await loadVersionCatalog({
          scope,
          homeWorktreeId: homeId,
          homeInstanceId: home?.instanceId,
          planTrees,
          worktrees,
          repoIds,
          projectId: scope.projectId,
          previous: lastView.current?.scopeKey === scopeKey ? lastView.current.catalog : null
        })
        if (!cancelled) {
          lastView.current = { repoId, scopeKey: scopeKey ?? '', sourceHostId, catalog: load }
          setCatalog(load)
        }
      } catch (reason) {
        if (!cancelled) {
          if (lastView.current?.scopeKey !== scopeKey) {
            setCatalog(null)
          }
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, homeId, fingerprint, repoIdsKey, repoId, nonce, sourceHostId])

  const currentLoad =
    lastView.current?.scopeKey === scopeKey ||
    (!scopeKey &&
      lastView.current?.repoId === repoId &&
      lastView.current?.sourceHostId === sourceHostId)
      ? catalog
      : null
  const visibleCatalog = useMemo(() => {
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
    return { entries: [...entries.values()], problems: currentLoad?.problems ?? [] }
  }, [currentLoad, worktrees, repoIdsKey, scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    scope,
    home,
    worktrees,
    repoIds,
    planTrees,
    catalog: visibleCatalog,
    loading,
    error,
    materialReady: currentLoad?.history?.ready ?? false,
    materialError: error ?? currentLoad?.history?.error ?? null,
    reload
  }
}
