import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  parseExecutionHostId
} from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import {
  countLiveAgentSessions,
  deriveSessionReading,
  type WallCardReadings,
  type WallCountReading,
  type WallProgressReading,
  type WallSessionReading,
  type WallVersionReading
} from './wall-card-readings'
import { readProjectPrs, readVersionAndProgress, resolvePlanContext } from './wall-readings-load'
import type { WallProject } from './workbench-wall-projects'

/**
 * 墙卡读数（spec「墙卡读数」）：版本/承诺进展与 PR 待审分两条异步链，
 * 会话计数是 store 现算。全部只读、现算、不落业务数据库（铁律一）；
 * 任一步读不到 → Unknown（「—」），不装绿、不装零（铁律二）；
 * 不推导健康结论，判断归人。
 *
 * 两条链的失效域刻意分开且按项目各自成键：版本链依赖活跃仓与各项目工作树
 * 登记（工作树晚到改指纹自愈重读，与总览实时重算保持同结论）；PR 链只依赖
 * 代码仓槽集合与刷新 token。单项目的变化只重读该项目，不整墙重发 gh/RPC。
 */

type VersionProgress = {
  version: WallVersionReading
  progress: WallProgressReading
}

const LOADING_VERSION: WallVersionReading = { kind: 'loading' }
const LOADING_PROGRESS: WallProgressReading = { kind: 'loading' }
const LOADING_COUNT: WallCountReading = { kind: 'loading' }
const UNDECIDED: VersionProgress = {
  version: { kind: 'undecided' },
  progress: { kind: 'hidden' }
}

/** 工作树登记指纹：行 id + 该行工作树 id 集合；晚到/新增/删除都会改变 → 触发版本链重读。 */
function worktreeFingerprint(
  project: WallProject,
  worktreesByRepo: Record<string, readonly Worktree[]>
): string {
  return project.rows
    .map(
      (row) =>
        `${row.id}:${(worktreesByRepo[row.id] ?? [])
          .map((worktree) => worktree.id)
          .sort()
          .join(',')}`
    )
    .join('|')
}

function versionKeyOf(
  project: WallProject,
  token: number,
  activeRepoId: string | null,
  worktreesByRepo: Record<string, readonly Worktree[]>
): string {
  // 活跃仓只影响「含该仓的项目」的行序；不含它的项目键不带活跃仓量，
  // 切活跃仓时这些项目不重读（兑现按项目失效域）。
  const activeInProject = project.rows.some((row) => row.id === activeRepoId) ? activeRepoId : null
  return JSON.stringify([
    token,
    activeInProject,
    project.rows.map((row) => `${row.id}|${row.path}`),
    worktreeFingerprint(project, worktreesByRepo)
  ])
}

function prKeyOf(project: WallProject, token: number): string {
  return JSON.stringify([token, project.slots.map((slot) => slot.repoId)])
}

export function useWallReadings(
  projects: readonly WallProject[],
  token: number
): Record<string, WallCardReadings> {
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)

  const [versionByKey, setVersionByKey] = useState<Record<string, VersionProgress>>({})
  const [prsByKey, setPrsByKey] = useState<Record<string, WallCountReading>>({})
  // 按项目失效域 + 「变化集指纹」作 effect 依赖：无关 store 变化（worktree head、
  // isUnread、注册排序）不改变化集字符串，进行中的轮次不被取消重跑；只有真失效
  // （指纹/活跃仓/槽集合/刷新 token）才重读，且只重读受影响的项目。
  const [loadedVersionKeys, setLoadedVersionKeys] = useState<Record<string, string>>({})
  const [loadedPrKeys, setLoadedPrKeys] = useState<Record<string, string>>({})

  const changedVersion = useMemo(
    () =>
      projects.flatMap((project) => {
        const key = versionKeyOf(project, token, activeRepoId, worktreesByRepo)
        return loadedVersionKeys[project.key] === key ? [] : [{ project, key }]
      }),
    [projects, token, activeRepoId, worktreesByRepo, loadedVersionKeys]
  )
  const changedVersionKey = useMemo(
    () => JSON.stringify(changedVersion.map((entry) => [entry.project.key, entry.key])),
    [changedVersion]
  )
  const changedPr = useMemo(
    () =>
      projects.flatMap((project) => {
        const key = prKeyOf(project, token)
        return loadedPrKeys[project.key] === key ? [] : [{ project, key }]
      }),
    [projects, token, repos, loadedPrKeys]
  )
  const changedPrKey = useMemo(
    () => JSON.stringify(changedPr.map((entry) => [entry.project.key, entry.key])),
    [changedPr]
  )

  useEffect(() => {
    if (changedVersion.length === 0) {
      return
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        changedVersion.map(async ({ project }): Promise<[string, VersionProgress]> => {
          const context = resolvePlanContext(project, worktreesByRepo, activeRepoId)
          if (!context) {
            return [project.key, UNDECIDED]
          }
          return [project.key, await readVersionAndProgress(context)]
        })
      )
      if (cancelled) {
        return
      }
      setVersionByKey((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
      setLoadedVersionKeys((prev) => ({
        ...prev,
        ...Object.fromEntries(changedVersion.map((entry) => [entry.project.key, entry.key]))
      }))
    })()
    return () => {
      cancelled = true
    }
    // 依赖是变化集指纹：集合不变不打扰在飞轮次；集合变（真失效或上轮落地）才重跑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedVersionKey])

  useEffect(() => {
    if (changedPr.length === 0) {
      return
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        changedPr.map(async ({ project }): Promise<[string, WallCountReading]> => [
          project.key,
          await readProjectPrs(project, repos, () => !cancelled)
        ])
      )
      if (cancelled) {
        return
      }
      setPrsByKey((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
      setLoadedPrKeys((prev) => ({
        ...prev,
        ...Object.fromEntries(changedPr.map((entry) => [entry.project.key, entry.key]))
      }))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedPrKey])

  // 会话计数是同步现算：agent 状态心跳到达即随 store 更新；新鲜度时钟复用
  // 仓内共享 useNow（与侧栏同模式），不在渲染内直接取 Date.now()。
  const now = useNow(30_000)
  const sessionsByKey = useMemo((): Record<string, WallSessionReading> => {
    const result: Record<string, WallSessionReading> = {}
    for (const project of projects) {
      const worktreeIds = new Set<string>()
      for (const row of project.rows) {
        const hostId = getRepoExecutionHostId(row)
        for (const worktree of worktreesByRepo[row.id] ?? []) {
          // 只计属于本注册行 host 的工作树（与 countWallProjectWorktrees 同一归属规则）。
          if (getWorktreeExecutionHostId(worktree, row) !== hostId) {
            continue
          }
          worktreeIds.add(worktree.id)
        }
      }
      const runtimeHostsAllOnline = project.hostIds.every((hostId) => {
        const parsed = parseExecutionHostId(hostId)
        if (parsed?.kind !== 'runtime') {
          // 本机/SSH 无 runtime 连接语义，不阻塞计数。
          return true
        }
        const status = runtimeStatusByEnvironmentId.get(parsed.environmentId)
        return status !== undefined && status.status !== null
      })
      const count = countLiveAgentSessions(agentStatusByPaneKey, tabsByWorktree, worktreeIds, now)
      const reading = deriveSessionReading(runtimeHostsAllOnline, count)
      result[project.key] =
        reading === 'unknown' ? { kind: 'unknown' } : { kind: 'value', count: reading }
    }
    return result
  }, [
    projects,
    worktreesByRepo,
    agentStatusByPaneKey,
    tabsByWorktree,
    runtimeStatusByEnvironmentId,
    now
  ])

  return useMemo((): Record<string, WallCardReadings> => {
    const result: Record<string, WallCardReadings> = {}
    for (const project of projects) {
      const vp = versionByKey[project.key] ?? {
        version: LOADING_VERSION,
        progress: LOADING_PROGRESS
      }
      result[project.key] = {
        version: vp.version,
        progress: vp.progress,
        sessions: sessionsByKey[project.key] ?? { kind: 'unknown' },
        prs: prsByKey[project.key] ?? LOADING_COUNT
      }
    }
    return result
  }, [projects, versionByKey, prsByKey, sessionsByKey])
}
