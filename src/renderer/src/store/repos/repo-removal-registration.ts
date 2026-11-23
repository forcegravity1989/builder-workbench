import type { Repo } from '../../../../shared/repo-types'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { AppState } from '../types'

export function repoMatchesRemovalRegistration(
  repo: Repo,
  expected: Pick<Repo, 'path' | 'addedAt' | 'pairedRegistration'>
): boolean {
  return (
    repo.path === expected.path &&
    repo.addedAt === expected.addedAt &&
    repo.pairedRegistration?.hostId === expected.pairedRegistration?.hostId &&
    repo.pairedRegistration?.pairingRevision === expected.pairedRegistration?.pairingRevision
  )
}

export function selectRepoRemovalHostLabel(state: AppState, repo: Repo): string {
  const hostId = getRepoExecutionHostId(repo)
  const transport = parseExecutionHostId(hostId)
  const logicalHostId = repo.pairedRegistration?.hostId
  const label = selectExecutionHostDisplayLabel(state, hostId)
  return transport?.kind === 'runtime' &&
    logicalHostId &&
    parseExecutionHostId(logicalHostId)?.kind === 'ssh'
    ? `${label} / ${selectExecutionHostDisplayLabel(state, logicalHostId, { sshEnvironmentId: transport.environmentId })}`
    : label
}
