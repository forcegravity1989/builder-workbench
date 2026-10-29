import { getRepoExecutionHostId, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { getRepoHostIdentityForParts } from '../../../shared/repo-host-identity'
import type { Repo } from '../../../shared/repo-types'
import {
  getTaskProjectPickerRepos,
  type TaskProjectPickerGroup
} from '../components/task-page-default-repo-selection'

type BuilderHost = { id: string; name: string; offline?: boolean }

export function builderTaskRepoSelectionId(repo: Repo): string {
  return getRepoHostIdentityForParts(repo.id, getRepoExecutionHostId(repo))
}

export function buildBuilderTaskProjects(
  repos: readonly Repo[],
  hosts: readonly BuilderHost[],
  selected: ReadonlySet<string> = new Set()
): TaskProjectPickerGroup[] {
  const groups = hosts.map((host): TaskProjectPickerGroup => ({
    projectKey: toRuntimeExecutionHostId(host.id),
    displayName: host.name,
    offline: host.offline,
    selectionMode: 'builder',
    repo: null,
    sources: []
  }))
  const byHost = new Map(groups.map((group) => [group.projectKey, group]))
  const localGroups: TaskProjectPickerGroup[] = []
  for (const repo of repos) {
    const hostId = getRepoExecutionHostId(repo)
    if (hostId.startsWith('runtime:')) {
      const group = byHost.get(hostId)
      // Removed Builder catalogs can survive a failed refresh; they are not new projects.
      if (!group) {
        continue
      }
      group.sources.push(repo)
      if (!group.repo || selected.has(builderTaskRepoSelectionId(repo))) {
        group.repo = repo
      }
    } else {
      localGroups.push({
        projectKey: builderTaskRepoSelectionId(repo),
        displayName: repo.displayName,
        selectionMode: 'builder',
        repo,
        sources: [repo]
      })
    }
  }
  return [...localGroups, ...groups]
}

export function normalizeBuilderTaskSelection(
  groups: readonly TaskProjectPickerGroup[],
  selection: ReadonlySet<string> | null,
  catalogHydrated = true
): Set<string> {
  // The saved host list hydrates separately from settings; absence is not removal until the host list is read successfully.
  if (selection && !catalogHydrated) {
    return new Set(selection)
  }
  const allSources = groups.flatMap((group) => group.sources)
  const ownerCounts = new Map<string, number>()
  for (const repo of allSources) {
    ownerCounts.set(repo.id, (ownerCounts.get(repo.id) ?? 0) + 1)
  }
  const selectedSources = allSources.filter((repo) => {
    if (selection?.has(builderTaskRepoSelectionId(repo))) {
      return true
    }
    // Legacy preferences contained bare ids. Migrate only an unambiguous owner.
    return selection?.has(repo.id) && ownerCounts.get(repo.id) === 1
  })
  const selectedIds = new Set(selectedSources.map(builderTaskRepoSelectionId))
  const selectedBuilderHosts = new Set([...(selection ?? [])].map((id) => id.split('\0')[0]))
  const selectedGroups = groups.filter(
    (group) =>
      selectedBuilderHosts.has(group.projectKey) ||
      group.sources.some((repo) => selectedIds.has(builderTaskRepoSelectionId(repo)))
  )
  const result = new Set<string>()
  for (const group of selectedGroups.length ? selectedGroups : groups) {
    if (group.sources.length === 0 && selectedBuilderHosts.has(group.projectKey)) {
      for (const id of selection ?? []) {
        if (id.startsWith(`${group.projectKey}\0`)) {
          result.add(id)
        }
      }
    }
    const preferred = new Set(
      group.sources
        .filter((repo) => selectedIds.has(builderTaskRepoSelectionId(repo)))
        .map((repo) => repo.id)
    )
    // Task queries retain one real checkout per remote inside this Builder, never across Builders.
    for (const repo of getTaskProjectPickerRepos(group.sources, preferred)) {
      result.add(builderTaskRepoSelectionId(repo))
    }
  }
  return result
}
