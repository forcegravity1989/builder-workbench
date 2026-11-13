import { z } from 'zod'
import { getRepoExecutionHostId, normalizeExecutionHostId } from '../execution-host'
import type { Repo } from '../repo-types'
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

export function findConfirmedRepoRegistration(
  repos: readonly Repo[],
  expected: z.output<typeof WorkbenchRepoRemoval>
): Repo | null {
  const matches = repos.filter(
    (repo) => repo.id === expected.repoId && getRepoExecutionHostId(repo) === expected.hostId
  )
  const repo = matches[0]
  return matches.length === 1 && repo.path === expected.path && repo.addedAt === expected.addedAt
    ? repo
    : null
}
