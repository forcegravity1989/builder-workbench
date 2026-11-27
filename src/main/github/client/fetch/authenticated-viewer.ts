import type { GitHubViewer } from '../../../../shared/github/pull-requests/pull-request-types'
import { ghExecFileAsync } from '../../../git/command-runner/hosted-cli/gh-exec-file'
import { acquire, release } from '../../execution/github-operation-slots'
import type { IssueSourcePreference } from '../../../../shared/repository/repo-types'
import type { LocalGitExecOptions } from '../../repositories/github-repository-identity'
import {
  resolveGitHubRepoExecution,
  resolveIssueGitHubApiRepositorySource
} from '../../repositories/github-api-repository'
/** Use the bounded runner so failed viewer probes return null without stranding a GitHub admission slot. */
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
      (await resolveIssueGitHubApiRepositorySource(
        repoPath, preference, connectionId, localGitOptions
      )).source,
    connectionId,
    localGitOptions
  )
  return ownerRepo ? getAuthenticatedViewer(ghOptions) : null
}

/** gh keys --cache by token, so a switched account never gets the old login. */
export async function readViewerLogin(
  ghOptions: Parameters<typeof ghExecFileAsync>[1]
): Promise<string | null> {
  try {
    const { stdout } = await ghExecFileAsync(
      ['api', '--cache', '60s', 'user', '--jq', '.login'],
      ghOptions
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}
