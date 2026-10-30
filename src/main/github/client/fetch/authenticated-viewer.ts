import type { GitHubViewer } from '../../../../shared/github/pull-request-types'
import { ghExecFileAsync, acquire, release } from '../../gh-utils'
import type { IssueSourcePreference } from '../../../../shared/repo-types'
import type { LocalGitExecOptions } from '../../gh-utils'
import {
  resolveGitHubRepoExecution,
  resolveIssueGitHubApiRepositorySource
} from '../../github-api-repository'
/**
 * Get the authenticated GitHub viewer when gh is available and logged in.
 * Returns null when gh is unavailable, unauthenticated, or the lookup fails.
 *
 * Runs through `ghExecFileAsync` for its deadline and tree kill: a `gh` that
 * never exits would otherwise hold one of the four GitHub concurrency slots
 * forever (#18234).
 */
export async function getAuthenticatedViewer(
  options?: Parameters<typeof ghExecFileAsync>[1]
): Promise<GitHubViewer | null> {
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      ['api', 'user', '--jq', '{login: .login, email: .email}'],
      { ...options, encoding: 'utf-8' }
    )
    const viewer = JSON.parse(stdout) as { login?: string; email?: string | null }
    if (!viewer.login?.trim()) {
      return null
    }
    return {
      login: viewer.login.trim(),
      email: viewer.email?.trim() || null
    }
  } catch {
    return null
  } finally {
    release()
  }
}

export async function getRepoAuthenticatedViewer(
  repoPath: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubViewer | null> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(
    repoPath,
    async () =>
      (
        await resolveIssueGitHubApiRepositorySource(
          repoPath,
          preference,
          connectionId,
          localGitOptions
        )
      ).source,
    connectionId,
    localGitOptions
  )
  return ownerRepo ? getAuthenticatedViewer(ghOptions) : null
}
