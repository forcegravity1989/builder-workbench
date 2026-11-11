import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { buildWallProjects, isWallRowVisible, type WallProject } from './workbench-wall-projects'

export type WallProjectFilters = { location: string; type: string }

export function useWallProjects(
  { location, type }: WallProjectFilters = {
    location: 'all',
    type: 'all'
  }
) {
  const repos = useAppStore((state) => state.repos)
  const groups = useAppStore((state) => state.projectGroups)
  const environments = useAppStore((state) => state.runtimeEnvironments)
  return useMemo(
    () =>
      buildWallProjects(
        repos.filter(
          (repo) =>
            isWallRowVisible(repo) &&
            (type === 'all' || (repo.projectVisibility ?? 'personal') === type) &&
            (location === 'all' ||
              (getRepoExecutionHostId(repo) === 'local') === (location === 'local'))
        ),
        groups,
        { environmentIds: new Set(environments.map((environment) => environment.id)) }
      ),
    [repos, groups, environments, location, type]
  )
}

export function findWallProjectForRepo(projects: readonly WallProject[], repo: Repo) {
  const host = getRepoExecutionHostId(repo)
  return projects.find((project) =>
    project.rows.some((row) => row.id === repo.id && getRepoExecutionHostId(row) === host)
  )
}
