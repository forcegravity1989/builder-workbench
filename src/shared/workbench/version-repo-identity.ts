import { normalizeGitRemoteUrl } from '../git-remote-identity'

/** Version materials belong to the checked-out repository, not its upstream project. */
export function versionRepoIdentity(repo: {
  gitRemoteIdentity?: { remoteUrl?: string | null; canonicalKey?: string | null } | null
}): string | null {
  return (
    normalizeGitRemoteUrl(repo.gitRemoteIdentity?.remoteUrl ?? '') ??
    repo.gitRemoteIdentity?.canonicalKey ??
    null
  )
}
