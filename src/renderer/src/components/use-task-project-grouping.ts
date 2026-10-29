import { useMemo, useCallback } from 'react'
import type { TaskPageStoreBindingsModel } from './use-task-page-store-bindings'
import {
  getTaskEligibleRepos,
  normalizeTaskRepoSelection,
  getDefaultTaskRepoSelection
} from './task-page-default-repo-selection'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import {
  buildBuilderTaskProjects,
  normalizeBuilderTaskSelection
} from '@/workbench/task-builder-projects'

export function useTaskProjectGrouping({
  repos,
  runtimeEnvironments,
  runtimeEnvironmentCatalogHydrated,
  runtimeStatusByEnvironmentId
}: Pick<
  TaskPageStoreBindingsModel,
  | 'repos'
  | 'runtimeEnvironments'
  | 'runtimeEnvironmentCatalogHydrated'
  | 'runtimeStatusByEnvironmentId'
>) {
  const eligibleRepos = useMemo(() => getTaskEligibleRepos(repos), [repos])
  const builderProjects = isWorkbenchShell()
  const builderHosts = useMemo(
    () =>
      builderProjects
        ? runtimeEnvironments.map((host) => ({
            id: host.id,
            name: host.name,
            offline: runtimeStatusByEnvironmentId.get(host.id)?.status === null
          }))
        : [],
    [builderProjects, runtimeEnvironments, runtimeStatusByEnvironmentId]
  )
  const builderGroups = useMemo(
    () => (builderProjects ? buildBuilderTaskProjects(eligibleRepos, builderHosts) : []),
    [builderProjects, eligibleRepos, builderHosts]
  )
  const normalizeRepoSelection = useCallback(
    (selection: ReadonlySet<string>) =>
      builderProjects
        ? normalizeBuilderTaskSelection(builderGroups, selection, runtimeEnvironmentCatalogHydrated)
        : normalizeTaskRepoSelection(eligibleRepos, selection),
    [builderProjects, builderGroups, eligibleRepos, runtimeEnvironmentCatalogHydrated]
  )
  const allTaskRepoSelection = useMemo(
    () =>
      builderProjects
        ? normalizeBuilderTaskSelection(builderGroups, null)
        : getDefaultTaskRepoSelection(eligibleRepos),
    [builderProjects, builderGroups, eligibleRepos]
  )

  return {
    eligibleRepos,
    builderProjects,
    builderHosts,
    normalizeRepoSelection,
    allTaskRepoSelection
  }
}
