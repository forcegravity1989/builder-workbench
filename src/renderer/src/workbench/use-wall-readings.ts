import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
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
 * 两条链的失效域刻意分开：版本链依赖活跃仓与各项目工作树登记（工作树晚到
 * 会改指纹自愈重读，与总览实时重算保持同结论）；PR 计数只依赖代码仓槽集合
 * 与刷新 token，切活跃项目不作废它，避免整墙重发 gh/RPC 调用风暴。
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

function versionQueryKey(
  projects: readonly WallProject[],
  token: number,
  activeRepoId: string | null,
  worktreesByRepo: Record<string, readonly Worktree[]>
): string {
  return JSON.stringify([
    token,
    activeRepoId,
    projects.map((project) => [
      project.key,
      project.rows.map((row) => `${row.id}|${row.path}`),
      worktreeFingerprint(project, worktreesByRepo)
    ])
  ])
}

function prQueryKey(projects: readonly WallProject[], token: number): string {
  return JSON.stringify([
    token,
    projects.map((project) => [project.key, project.slots.map((slot) => slot.repoId)])
  ])
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
  const versionKey = useMemo(
    () => versionQueryKey(projects, token, activeRepoId, worktreesByRepo),
    [projects, token, activeRepoId, worktreesByRepo]
  )
  const prKey = useMemo(() => prQueryKey(projects, token), [projects, token])
  // 只在成功落地后记录已加载的键：被取消的轮次不消费键（沿 use-wall-adoptions 守卫语义）。
  const loadedVersionKeyRef = useRef<string | null>(null)
  const loadedPrKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (loadedVersionKeyRef.current === versionKey) {
      return
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        projects.map(async (project): Promise<[string, VersionProgress]> => {
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
      setVersionByKey(Object.fromEntries(entries))
      loadedVersionKeyRef.current = versionKey
    })()
    return () => {
      cancelled = true
    }
    // 注册行、活跃仓与工作树登记变化都已在 versionKey 指纹内；store 引用不进依赖，
    // 避免每次心跳重发 materials/history RPC。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionKey])

  useEffect(() => {
    if (loadedPrKeyRef.current === prKey) {
      return
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        projects.map(async (project): Promise<[string, WallCountReading]> => [
          project.key,
          await readProjectPrs(project, repos, () => !cancelled)
        ])
      )
      if (cancelled) {
        return
      }
      setPrsByKey(Object.fromEntries(entries))
      loadedPrKeyRef.current = prKey
    })()
    return () => {
      cancelled = true
    }
    // 槽集合与刷新 token 已在 prKey 内；store 引用不进依赖，理由同上。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prKey])

  // 会话计数是同步现算：agent 状态心跳到达即随 store 更新，不等「刷新」。
  const sessionsByKey = useMemo((): Record<string, WallSessionReading> => {
    const now = Date.now()
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
    runtimeStatusByEnvironmentId
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
