import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { normalizeGitRemoteUrl } from '../../../shared/git-remote-identity'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import type { Worktree } from '../../../shared/worktree/types'
import {
  loadVersionCatalog,
  type VersionCatalogLoad,
  type VersionCatalogPlanTree
} from './version-catalog-load'
import { nativeWorkspaceScope, type NativeWorkspaceScope } from './version-cycle/native-workspace'
import { cycleBranch } from './version-cycle/native-cycle-workspace'

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
  reload: () => void
}

function identityKeyOf(repo: {
  id: string
  gitRemoteIdentity?: { remoteUrl?: string | null; canonicalKey?: string | null } | null
}): string | null {
  const normalized = normalizeGitRemoteUrl(repo.gitRemoteIdentity?.remoteUrl ?? '')
  return normalized ?? repo.gitRemoteIdentity?.canonicalKey ?? null
}

export function useVersionCatalogForRepo(repoId: string | null): VersionCatalogState {
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  // 同项目跨宿主注册行（配对机同仓）一并纳入绑定汇总，沿远端身份归并。
  const repoIds = useMemo(() => {
    if (!repoId) {
      return []
    }
    const target = repos.find((repo) => repo.id === repoId)
    const key = target ? identityKeyOf(target) : null
    if (!key) {
      return [repoId]
    }
    const ids = repos.filter((repo) => identityKeyOf(repo) === key).map((repo) => repo.id)
    return ids.includes(repoId) ? ids : [repoId, ...ids]
  }, [repoId, repos])
  const repoIdsKey = repoIds.join(',')

  const worktrees = useMemo(() => {
    const rows: Worktree[] = []
    for (const id of repoIds) {
      const bucket = worktreesByRepo[id]
      if (bucket) {
        rows.push(...bucket)
      }
    }
    return rows
  }, [repoIdsKey, worktreesByRepo]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const planTrees = useMemo(() => {
    const trees: VersionCatalogPlanTree[] = []
    const legacyTrees: VersionCatalogPlanTree[] = []
    const legacyBranch = cycleBranch({ workflow: 'plan' })
    const ownerOf = (tree: Worktree) => {
      // 配对宿主树按自身 owner 路由读取；解析失败的行退回主树范围（读取失败
      // 会如实进 problem 通道，不装绿）。
      try {
        const treeScope = nativeWorkspaceScope(tree)
        return {
          hostId: treeScope.hostId,
          ...(treeScope.runtimeOwnerEnvironmentId
            ? { runtimeOwnerEnvironmentId: treeScope.runtimeOwnerEnvironmentId }
            : {})
        }
      } catch {
        return {}
      }
    }
    for (const tree of worktrees) {
      if (tree.isArchived) {
        continue
      }
      const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
      if (binding?.workflow === 'plan') {
        trees.push({ worktreeId: tree.id, version: binding.version, ...ownerOf(tree) })
        continue
      }
      if (!binding && tree.branch.replace(/^refs\/heads\//, '') === legacyBranch) {
        trees.push({ worktreeId: tree.id, version: null, ...ownerOf(tree) })
      }
    }
    // 绑定树排前：目录 goals 派生按先到先得，绑定副本优先于旧固定树副本（C-2）。
    return [...trees, ...legacyTrees]
  }, [worktrees])

  const [catalog, setCatalog] = useState<VersionCatalogLoad | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 登记变化（绑定写入/删树/实例更换）用指纹触发重读；目录永远是现算。
  const fingerprint = useMemo(
    () =>
      worktrees
        .map((tree) =>
          [
            tree.id,
            tree.instanceId ?? '',
            tree.isArchived ? '1' : '0',
            JSON.stringify(tree.workbenchVersionBinding ?? null)
          ].join('|')
        )
        .join(';'),
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
      setCatalog(null)
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
          planTrees,
          worktrees,
          repoIds,
          projectId: scope.projectId
        })
        if (!cancelled) {
          setCatalog(load)
        }
      } catch (reason) {
        if (!cancelled) {
          setCatalog(null)
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
  }, [scopeKey, homeId, fingerprint, repoIdsKey, nonce])

  return { scope, home, worktrees, repoIds, planTrees, catalog, loading, error, reload }
}
