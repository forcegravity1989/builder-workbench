import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { getRepoHostIdentityForParts } from '../../../shared/repo-host-identity'
import {
  getProjectIdentityKey,
  hasProjectRemoteIdentity
} from '../../../shared/project-host-setup-projection'
import type { Repo } from '../../../shared/repo-types'
import type { ProjectHostSetup } from '../../../shared/project-types'
import type { TaskProjectPickerGroup } from '../components/task-page-default-repo-selection'

export function taskRepoSelectionId(repo: Repo): string {
  return getRepoHostIdentityForParts(repo.id, getRepoExecutionHostId(repo))
}

export function buildTaskProjectGroups(
  repos: readonly Repo[],
  selected: ReadonlySet<string> = new Set(),
  setups: readonly ProjectHostSetup[] = []
): TaskProjectPickerGroup[] {
  const setupBySource = new Map(
    setups.map((setup) => [getRepoHostIdentityForParts(setup.repoId, setup.hostId), setup])
  )
  const projectFor = (repo: Repo) => {
    const setup = setupBySource.get(taskRepoSelectionId(repo))
    return setup?.path === repo.path && !setup.projectId.startsWith('repo:')
      ? setup.projectId
      : undefined
  }
  const remoteKeysByProject = new Map<string, Set<string>>()
  for (const repo of repos) {
    const projectId = projectFor(repo)
    if (projectId && hasProjectRemoteIdentity(repo)) {
      const keys = remoteKeysByProject.get(projectId) ?? new Set<string>()
      keys.add(getProjectIdentityKey(repo))
      remoteKeysByProject.set(projectId, keys)
    }
  }
  const groups = new Map<string, TaskProjectPickerGroup>()
  for (const repo of repos) {
    const sourceId = taskRepoSelectionId(repo)
    const catalogId = projectFor(repo)
    const remoteKeys = catalogId ? remoteKeysByProject.get(catalogId) : undefined
    const catalogKey =
      remoteKeys?.size === 1 ? [...remoteKeys][0] : !remoteKeys?.size ? catalogId : undefined
    const projectKey = hasProjectRemoteIdentity(repo)
      ? getProjectIdentityKey(repo)
      : (catalogKey ?? `repo:${sourceId}`)
    const group = groups.get(projectKey)
    if (group) {
      group.sources.push(repo)
    } else {
      groups.set(projectKey, { projectKey, repo, sources: [repo], selectionKey: 'host' })
    }
  }
  return [...groups.values()].map((group) => {
    const sources = [...group.sources].sort((a, b) => {
      const preferred =
        Number(selected.has(taskRepoSelectionId(b))) - Number(selected.has(taskRepoSelectionId(a)))
      const local =
        Number(getRepoExecutionHostId(b) === 'local') -
        Number(getRepoExecutionHostId(a) === 'local')
      return (
        preferred ||
        local ||
        a.addedAt - b.addedAt ||
        taskRepoSelectionId(a).localeCompare(taskRepoSelectionId(b))
      )
    })
    return { ...group, repo: sources[0]!, sources }
  })
}

export function normalizeProjectTaskSelection(
  groups: readonly TaskProjectPickerGroup[],
  selection: ReadonlySet<string> | null,
  catalogHydrated = true,
  knownHosts: ReadonlySet<string> = new Set()
): Set<string> {
  // A failed or unfinished host catalog read cannot prove that a saved source was removed.
  if (selection && !catalogHydrated) {
    return new Set(selection)
  }
  const ownerCounts = new Map<string, number>()
  for (const source of groups.flatMap((group) => group.sources)) {
    ownerCounts.set(source.id, (ownerCounts.get(source.id) ?? 0) + 1)
  }
  const selectedSources = groups.flatMap((group) => {
    const source =
      group.sources.find((repo) => selection?.has(taskRepoSelectionId(repo))) ??
      group.sources.find((repo) => selection?.has(repo.id) && ownerCounts.get(repo.id) === 1)
    return source ? [source] : []
  })
  const available = new Set(groups.flatMap((group) => group.sources.map(taskRepoSelectionId)))
  const pending = [...(selection ?? [])].filter(
    (id) => !available.has(id) && knownHosts.has(id.split('\0')[0]!)
  )
  const sources =
    selectedSources.length || pending.length ? selectedSources : groups.map((group) => group.repo)
  return new Set([...sources.map(taskRepoSelectionId), ...pending])
}
