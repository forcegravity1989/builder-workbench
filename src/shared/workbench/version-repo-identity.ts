import { normalizeGitRemoteUrl } from '../git-remote-identity'

/** Version materials belong to the checked-out repository, not its upstream project. */
export function versionRepoIdentity(repo: {
  gitRemoteIdentity?: {
    remoteUrl?: string | null
    canonicalKey?: string | null
    remoteName?: string | null
    originUrl?: string | null
  } | null
}): string | null {
  const identity = repo.gitRemoteIdentity
  if (identity?.remoteName === 'upstream' && identity.originUrl !== null) {
    return normalizeGitRemoteUrl(identity.originUrl ?? '')
  }
  return normalizeGitRemoteUrl(identity?.remoteUrl ?? '') ?? identity?.canonicalKey ?? null
}
