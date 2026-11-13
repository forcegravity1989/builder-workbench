import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import { getProjectGroupSubtreeIds } from '../../../../shared/project-groups'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import { catalogOwnsHost, getProjectGroupHostId } from './project-group-owner-routing'
import { getRepoHostIdentity } from './repo-host-identity'

export type ProjectGroupRemovalTargets = {
  ownerHostId: ExecutionHostId | null
  deletedGroupIds: Set<string>
  projects: Repo[]
}

export function projectGroupRemovalKeys(projects: readonly Repo[]): string[] {
  return projects
    .map((repo) =>
      JSON.stringify([getRepoHostIdentity(repo), repo.path, repo.addedAt, repo.pairedRegistration])
    )
    .sort()
}

export function selectProjectGroupRemovalTargets(
  projectGroups: readonly ProjectGroup[],
  repos: readonly Repo[],
  groupId: string,
  hostId?: ExecutionHostId | null
): ProjectGroupRemovalTargets {
  const roots = projectGroups.filter(
    (group) => group.id === groupId && (!hostId || getProjectGroupHostId(group) === hostId)
  )
  if (roots.length !== 1) {
    return { ownerHostId: null, deletedGroupIds: new Set(), projects: [] }
  }

  const ownerHostId = getProjectGroupHostId(roots[0])
  const ownsRowHost = (rowHostId: ExecutionHostId) => catalogOwnsHost(ownerHostId, rowHostId)
  const ownerGroups = projectGroups.filter((group) => ownsRowHost(getProjectGroupHostId(group)))
  const deletedGroupIds = getProjectGroupSubtreeIds(ownerGroups, groupId)
  const projects = repos.filter(
    (repo) =>
      repo.projectGroupId &&
      deletedGroupIds.has(repo.projectGroupId) &&
      ownsRowHost(getRepoExecutionHostId(repo))
  )
  return { ownerHostId, deletedGroupIds, projects }
}
