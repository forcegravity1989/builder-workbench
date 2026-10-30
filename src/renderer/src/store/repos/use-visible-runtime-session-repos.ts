import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { visibleRuntimeSessionRepos } from './runtime-session-placeholder-visibility'

export function useVisibleRuntimeSessionRepos() {
  const repos = useAppStore((s) => s.repos)
  const catalogs = useAppStore((s) => s.runtimeRepoCatalogIdsByHost)
  const statuses = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  return useMemo(
    () => visibleRuntimeSessionRepos(repos, catalogs, statuses),
    [repos, catalogs, statuses]
  )
}

export function useVisibleRuntimeSessionActiveRepo() {
  const repos = useVisibleRuntimeSessionRepos()
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  return repos.find((repo) => repo.id === activeRepoId) ?? repos[0]
}
