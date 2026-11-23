import { z } from 'zod'
import { getRepoExecutionHostId, normalizeExecutionHostId } from '../execution-host'
import type { Repo } from '../repo-types'
import type { ProjectGroup } from '../project-group-types'
import { getProjectGroupSubtreeIds } from '../project-groups'
import { requiredString } from '../rpc-contract/rpc-param-primitives'

export const WorkbenchRepoRemoval = z.object({
  repoId: requiredString('Missing repository ID'),
  hostId: z.string().transform((value, ctx) => {
    const hostId = normalizeExecutionHostId(value)
    if (!hostId) {
      ctx.addIssue({ code: 'custom', message: 'Invalid host ID' })
      return z.NEVER
    }
    return hostId
  }),
  path: z.string().min(1),
  addedAt: z.number()
})

export type ConfirmedRepoRegistration = z.output<typeof WorkbenchRepoRemoval>

export const WorkbenchGroupRemoval = z.object({
  groupId: requiredString('Missing project group ID'),
  members: z.array(WorkbenchRepoRemoval)
})

export function hasConfirmedGroupMembership(
  groups: readonly ProjectGroup[],
  repos: readonly Repo[],
  groupId: string,
  expected: readonly ConfirmedRepoRegistration[]
): boolean {
  const deletedGroupIds = getProjectGroupSubtreeIds(groups, groupId)
  const members = repos.filter(
    (repo) => repo.projectGroupId && deletedGroupIds.has(repo.projectGroupId)
  )
  const confirmed = new Set(
    expected.map((member) => findConfirmedRepoRegistration(members, member))
  )
  return (
    groups.some((group) => group.id === groupId) &&
    members.length === expected.length &&
    confirmed.size === members.length &&
    !confirmed.has(null)
  )
}

export function findConfirmedRepoRegistration(
  repos: readonly Repo[],
  expected: ConfirmedRepoRegistration
): Repo | null {
  const matches = repos.filter(
    (repo) => repo.id === expected.repoId && getRepoExecutionHostId(repo) === expected.hostId
  )
  const repo = matches[0]
  return matches.length === 1 && repo.path === expected.path && repo.addedAt === expected.addedAt
    ? repo
    : null
}
