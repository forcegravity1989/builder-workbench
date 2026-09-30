import { isCodeHubGitRemote } from '../../shared/codehub'
import type { GitRemoteIdentity } from '../../shared/git-remote-identity'
import { CODEHUB_ARCHIVE_UNPROVABLE_REASON } from '../../shared/workbench/version-archive'

/** Registered CodeHub remotes never have a GitHub archive reader. */
export function registeredCodeHubArchiveReason(
  identity: Pick<GitRemoteIdentity, 'remoteUrl' | 'canonicalKey'> | null | undefined
): string | null {
  return isCodeHubGitRemote(identity) ? CODEHUB_ARCHIVE_UNPROVABLE_REASON : null
}
