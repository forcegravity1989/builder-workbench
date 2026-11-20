import type { Repo } from '../../../shared/repo-types'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import { isGitHubBackedRepo } from '../../../shared/project-host-setup-projection'

export type SdlcProvider = 'github' | 'codehub'

export function sdlcProviderOf(
  repo: Pick<Repo, 'upstream' | 'repoIcon' | 'gitRemoteIdentity'> | null | undefined
): SdlcProvider | null {
  if (!repo) {
    return null
  }
  if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    return 'codehub'
  }
  return isGitHubBackedRepo(repo) ? 'github' : null
}
