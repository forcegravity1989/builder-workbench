import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import type { Repo } from '../../../shared/repo-types'
import type { CharterStatus } from '../../../shared/workbench/charter'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { readCharterPrStatus, readRepoCharter } from './charter-port'
import type { ProjectCharter } from './project-charter'
import type { WallProject } from './workbench-wall-projects'

export type WallAdoption =
  | { adopted: true; charter: ProjectCharter | null; status: CharterStatus | null }
  | { adopted: false }

function isOfflineRuntimeRow(row: Repo): boolean {
  const parsed = parseExecutionHostId(getRepoExecutionHostId(row))
  if (parsed?.kind !== 'runtime') {
    return false
  }
  // 连接事实来自 Orca runtime 状态:明确离线就跳过读取,不为每行白等一次超时。
  const status = useAppStore.getState().runtimeStatusByEnvironmentId.get(parsed.environmentId)
  return status !== undefined && status.status === null
}

/**
 * 上墙判据(spec G3):任一注册行读到 `.bw/project.toml` → 已纳入;
 * 读不到名片但本机主检出有名片 PR 证据(bw/project 待合入、已合入未更新、
 * HEAD 已含名片)→ 仍算已纳入(PR #285 边缘不得掉墙);其余留在 Orca Projects。
 * 离线/查询失败按「读不到」处理,不冒充已纳入,连接事实由墙上主机标签如实呈现。
 */
export async function resolveWallAdoption(project: WallProject): Promise<WallAdoption> {
  let localRow: Repo | null = null
  for (const row of project.rows) {
    if (isOfflineRuntimeRow(row)) {
      continue
    }
    const read = await readRepoCharter(row)
    if (read.charter) {
      return { adopted: true, charter: read.charter, status: null }
    }
    if (!localRow && parseExecutionHostId(getRepoExecutionHostId(row))?.kind === 'local') {
      localRow = row
    }
  }
  if (localRow) {
    const status = await readCharterPrStatus(localRow)
    if (status.pr?.state === 'open' || status.pr?.state === 'merged' || status.headHasCharter) {
      return { adopted: true, charter: null, status }
    }
  }
  return { adopted: false }
}

/**
 * 整面墙的纳入判据加载:projects 或 token(刷新)变化时重算;
 * loadCount 在每轮完成后 +1,供页面记录「上次刷新时间」。
 */
export function useWallAdoptions(
  projects: readonly WallProject[],
  token: number
): { adoptionByKey: Record<string, WallAdoption>; loadCount: number } {
  const [adoptionByKey, setAdoptionByKey] = useState<Record<string, WallAdoption>>({})
  const [loadCount, setLoadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        projects.map(async (project) => [project.key, await resolveWallAdoption(project)] as const)
      )
      if (cancelled) {
        return
      }
      setAdoptionByKey(Object.fromEntries(entries))
      setLoadCount((n) => n + 1)
    })()
    return () => {
      cancelled = true
    }
  }, [projects, token])

  return { adoptionByKey, loadCount }
}
