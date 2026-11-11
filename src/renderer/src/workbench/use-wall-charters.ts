import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { readRepoCharter } from './charter-port'
import type { ProjectCharter } from './project-charter'
import { wallProjectVersionRows, type WallProject } from './workbench-wall-projects'
import { createWallCardCache, useWallCardReads } from './use-wall-card-reads'
import { type useWallRefresh, wallReadRevision } from './wall-refresh'

const cache = createWallCardCache<ProjectCharter | null>()

async function readWallCharter(rows: readonly Repo[]): Promise<ProjectCharter | null> {
  let readError: string | undefined
  for (const row of rows) {
    if (row.kind === 'folder') {
      continue
    }
    const owner = parseExecutionHostId(getRepoExecutionHostId(row))
    if (
      owner?.kind === 'runtime' &&
      useAppStore.getState().runtimeStatusByEnvironmentId.get(owner.environmentId)?.status === null
    ) {
      readError ??= '项目主机未连接'
      continue
    }
    const read = await readRepoCharter(row).catch((error: unknown) => ({
      charter: null,
      error: String(error)
    }))
    if (read.charter) {
      return read.charter
    }
    readError ??= read.error
  }
  if (readError) {
    throw new Error(readError)
  }
  return null
}

/** Optional metadata never decides whether a registered project is reachable. */
export function useWallCharters(
  projects: readonly WallProject[],
  refresh: ReturnType<typeof useWallRefresh>
) {
  const reads = useMemo(
    () =>
      projects.map((project) => {
        const rows = wallProjectVersionRows(project)
        return {
          projectKey: project.key,
          sourceKey: JSON.stringify(
            rows.map((row) => [getRepoExecutionHostId(row), row.id, row.path, row.kind])
          ),
          revision: wallReadRevision(refresh, rows),
          load: () => readWallCharter(rows)
        }
      }),
    [projects, refresh]
  )
  return useWallCardReads(reads, cache)
}
