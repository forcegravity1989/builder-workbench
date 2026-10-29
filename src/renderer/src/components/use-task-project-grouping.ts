import { useMemo, useCallback } from 'react'
import type { TaskPageStoreBindingsModel } from './use-task-page-store-bindings'
import {
  getTaskEligibleRepos,
  normalizeTaskRepoSelection,
  getDefaultTaskRepoSelection
} from './task-page-default-repo-selection'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { buildTaskProjectGroups, normalizeProjectTaskSelection } from '@/workbench/task-projects'

export function useTaskProjectGrouping({
  repos,
  projectHostSetups,
  runtimeEnvironments,
  runtimeEnvironmentCatalogHydrated
}: Pick<
  TaskPageStoreBindingsModel,
  'repos' | 'projectHostSetups' | 'runtimeEnvironments' | 'runtimeEnvironmentCatalogHydrated'
>) {
  const eligibleRepos = useMemo(() => getTaskEligibleRepos(repos), [repos])
  const hostQualifiedSelection = isWorkbenchShell()
  const knownHosts = useMemo(
    () =>
      new Set(
        hostQualifiedSelection ? runtimeEnvironments.map((host) => `runtime:${host.id}`) : []
      ),
    [hostQualifiedSelection, runtimeEnvironments]
  )
  const projectGroups = useMemo(
    () =>
      hostQualifiedSelection
        ? buildTaskProjectGroups(eligibleRepos, new Set(), projectHostSetups)
        : [],
    [hostQualifiedSelection, eligibleRepos, projectHostSetups]
  )
  const normalizeRepoSelection = useCallback(
    (selection: ReadonlySet<string>) =>
      hostQualifiedSelection
        ? normalizeProjectTaskSelection(
            projectGroups,
            selection,
            runtimeEnvironmentCatalogHydrated,
            knownHosts
          )
        : normalizeTaskRepoSelection(eligibleRepos, selection),
    [
      hostQualifiedSelection,
      projectGroups,
      eligibleRepos,
      runtimeEnvironmentCatalogHydrated,
      knownHosts
    ]
  )
  const allTaskRepoSelection = useMemo(
    () =>
      hostQualifiedSelection
        ? normalizeProjectTaskSelection(projectGroups, null)
        : getDefaultTaskRepoSelection(eligibleRepos),
    [hostQualifiedSelection, projectGroups, eligibleRepos]
  )
  return { eligibleRepos, hostQualifiedSelection, normalizeRepoSelection, allTaskRepoSelection }
}
