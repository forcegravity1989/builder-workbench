import type { RepoRegistrationSnapshot } from '../../../../shared/workbench/repo-removal'

export function repoMatchesRemovalRegistration(
  repo: RepoRegistrationSnapshot,
  expected: RepoRegistrationSnapshot
): boolean {
  return repo.path === expected.path && repo.addedAt === expected.addedAt
}
