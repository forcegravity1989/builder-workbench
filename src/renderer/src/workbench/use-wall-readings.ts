import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  parseExecutionHostId
} from '../../../shared/execution-host'
import {
  countLiveAgentSessions,
  deriveSessionReading,
  type WallCardReadings,
  type WallProgressReading,
  type WallSessionReading,
  type WallVersionReading
} from './wall-card-readings'
import { readProjectPrs, readVersionAndProgress, resolvePlanContext } from './wall-readings-load'
import type { WallProject } from './workbench-wall-projects'

/**
 * 墙卡读数（spec「墙卡读数」）：版本 / 承诺进展 / PR 待审走异步读取，
 * 会话计数是 store 现算。全部只读、现算、不落业务数据库（铁律一）；
 * 任一步读不到 → Unknown（「—」），不装绿、不装零（铁律二）；
 * 不推导健康结论，判断归人。
 */

type AsyncReadings = {
  version: WallVersionReading
  progress: WallProgressReading
  prs: WallCardReadings['prs']
}

const LOADING: AsyncReadings = {
  version: { kind: 'loading' },
  progress: { kind: 'loading' },
  prs: { kind: 'loading' }
}

function readingsQueryKey(projects: readonly WallProject[], token: number): string {
  return JSON.stringify([
    token,
    projects.map((project) => [
      project.key,
      project.rows.map((row) => `${row.id}|${row.path}`),
      project.slots.map((slot) => slot.repoId)
    ])
  ])
}

export function useWallReadings(
  projects: readonly WallProject[],
  token: number
): Record<string, WallCardReadings> {
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)

  const [asyncByKey, setAsyncByKey] = useState<Record<string, AsyncReadings>>({})
  const queryKey = useMemo(() => readingsQueryKey(projects, token), [projects, token])
  // 只在成功落地后记录已加载的键：被取消的轮次不消费键（沿 use-wall-adoptions 守卫语义）。
  const loadedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (loadedKeyRef.current === queryKey) {
      return
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        projects.map(async (project): Promise<[string, AsyncReadings]> => {
          const context = resolvePlanContext(project, worktreesByRepo)
          const [versionProgress, prs] = await Promise.all([
            context
              ? readVersionAndProgress(context)
              : Promise.resolve({
                  version: { kind: 'undecided' } as WallVersionReading,
                  progress: { kind: 'hidden' } as WallProgressReading
                }),
            readProjectPrs(project, repos)
          ])
          return [project.key, { ...versionProgress, prs }]
        })
      )
      if (cancelled) {
        return
      }
      setAsyncByKey(Object.fromEntries(entries))
      loadedKeyRef.current = queryKey
    })()
    return () => {
      cancelled = true
    }
    // repos/worktreesByRepo 变化已由 queryKey（行 id/路径）守卫；store 引用不进依赖，
    // 避免每次心跳重发 gh/RPC 查询。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey])

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

  const merged = useMemo((): Record<string, WallCardReadings> => {
    const result: Record<string, WallCardReadings> = {}
    for (const project of projects) {
      const asyncReading = asyncByKey[project.key] ?? LOADING
      result[project.key] = {
        ...asyncReading,
        sessions: sessionsByKey[project.key] ?? { kind: 'unknown' }
      }
    }
    return result
  }, [projects, asyncByKey, sessionsByKey])

  return merged
}
