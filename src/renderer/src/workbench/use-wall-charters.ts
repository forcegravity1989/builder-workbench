import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { readRepoCharter } from './charter-port'
import type { ProjectCharter } from './project-charter'
import { wallProjectVersionRows, type WallProject } from './workbench-wall-projects'

/** Optional metadata never decides whether a registered project is reachable. */
export function useWallCharters(projects: readonly WallProject[], token: number) {
  const [values, setValues] = useState<
    Record<string, { key: string; charter: ProjectCharter | null }>
  >({})
  const inputs = useMemo(
    () =>
      projects.map((project) => ({
        project,
        key: JSON.stringify([
          token,
          wallProjectVersionRows(project).map((row) => [
            row.id,
            row.path,
            getRepoExecutionHostId(row)
          ])
        ])
      })),
    [projects, token]
  )
  const changed = inputs.filter((input) => values[input.project.key]?.key !== input.key)
  const changedKey = JSON.stringify(changed.map((input) => [input.project.key, input.key]))
  useEffect(() => {
    if (!changed.length) {
      return
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        changed.map(async ({ project, key }) => {
          for (const row of wallProjectVersionRows(project)) {
            if (row.kind === 'folder') {
              continue
            }
            const owner = parseExecutionHostId(getRepoExecutionHostId(row))
            if (
              owner?.kind === 'runtime' &&
              useAppStore.getState().runtimeStatusByEnvironmentId.get(owner.environmentId)
                ?.status === null
            ) {
              continue
            }
            const read = await readRepoCharter(row).catch(() => ({ charter: null }))
            if (read.charter) {
              return [project.key, { key, charter: read.charter }] as const
            }
          }
          return [project.key, { key, charter: null }] as const
        })
      )
      if (!cancelled) {
        setValues((previous) => ({ ...previous, ...Object.fromEntries(entries) }))
      }
    })()
    return () => {
      cancelled = true
    }
    // Changes are scoped to one project's host registrations or explicit refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedKey])
  return Object.fromEntries(
    inputs.map(({ project, key }) => [
      project.key,
      values[project.key]?.key === key ? values[project.key].charter : null
    ])
  )
}
