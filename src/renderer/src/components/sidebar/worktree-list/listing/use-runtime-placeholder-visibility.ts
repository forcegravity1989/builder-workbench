import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { isMissingRuntimeSessionPlaceholder } from '@/store/repos/runtime-session-placeholder-visibility'
import { useVisibleRuntimeSessionRepos } from '@/store/repos/use-visible-runtime-session-repos'
import { buildWallProjects } from '@/workbench/workbench-wall-projects'
import type { Repo } from '../../../../../../shared/repo-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'

export function useRuntimePlaceholderVisibility() {
  const catalogRepos = useAppStore((s) => s.repos)
  const catalogRepoMap = useRepoMap()
  const catalogs = useAppStore((s) => s.runtimeRepoCatalogIdsByHost)
  const statuses = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const environments = useAppStore((s) => s.runtimeEnvironments)
  const hostCatalog = useMemo(
    () => ({ environmentIds: new Set(environments.map((environment) => environment.id)) }),
    [environments]
  )
  const isMissingPlaceholder = useCallback(
    (item: { runtimeSessionPlaceholder?: true; hostId?: string; repoId: string }) =>
      isMissingRuntimeSessionPlaceholder(item, catalogs, statuses),
    [catalogs, statuses]
  )
  const repos = useVisibleRuntimeSessionRepos()
  const repoMap = useMemo(
    () =>
      repos.length === catalogRepos.length
        ? catalogRepoMap
        : new Map(repos.map((repo) => [repo.id, repo])),
    [repos, catalogRepos, catalogRepoMap]
  )
  return { repos, repoMap, isMissingPlaceholder, hostCatalog }
}

export function useWorkbenchProjectScope(
  project: { repoIds: readonly string[] } | undefined,
  activeRepoId: string | null,
  repos: readonly Repo[],
  groups: readonly ProjectGroup[],
  hostCatalog: { environmentIds: ReadonlySet<string> }
) {
  return useMemo(() => {
    if (!project || !activeRepoId) {
      return undefined
    }
    const repoIds = new Set(project.repoIds)
    for (const entry of buildWallProjects(repos, groups, hostCatalog)) {
      if (entry.repoIds.some((id) => repoIds.has(id))) {
        for (const id of entry.repoIds) {
          repoIds.add(id)
        }
      }
    }
    return { repoId: activeRepoId, repoIds: [...repoIds] }
  }, [project, activeRepoId, repos, groups, hostCatalog])
}
