import { parseCodeHubRemote, type CodeHubRemote } from '../../shared/codehub'
import {
  getRemoteUrlForRepo,
  githubRepoContext,
  type LocalGitExecOptions
} from '../github/github-repository-identity'

/** Origin first: a workbench clone's CodeHub project remote is origin. */
export async function readCodeHubRemoteForRepo(
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<CodeHubRemote | null> {
  const context = githubRepoContext(repoPath, connectionId, localGitOptions)
  for (const remoteName of ['origin', 'upstream']) {
    try {
      const parsed = parseCodeHubRemote(await getRemoteUrlForRepo(context, remoteName))
      if (parsed) {
        return parsed
      }
    } catch {
      // A missing remote is not a CodeHub project.
    }
  }
  return null
}
