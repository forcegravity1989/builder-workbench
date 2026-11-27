import type { GitHubRepositoryIdentity } from '../../shared/github/repositories/repository-identity'
import type { GitAdmissionTier } from '../../shared/rpc-contract/source-control/git-admission-tier-params'
import type { GhAccountBinding } from '../../shared/github/accounts/account-binding'

export type HostedReviewLocalGitOptions = {
  taskRepository?: GitHubRepositoryIdentity
  taskRemoteCandidates?: { origin?: GitHubRepositoryIdentity; upstream?: GitHubRepositoryIdentity }
  wslDistro?: string
  admissionTier?: GitAdmissionTier
  ghAccount?: GhAccountBinding
}

export type HostedReviewExecutionOptions = {
  localGitExecOptions?: HostedReviewLocalGitOptions
  /** Configured Orca shared links are clean only when untracked real symlinks, never user files. */
  sharedLinkPaths?: readonly string[]
}

export function getHostedReviewLocalGitOptions(
  options: HostedReviewExecutionOptions = {}
): HostedReviewLocalGitOptions {
  const wslDistro = options.localGitExecOptions?.wslDistro
  const admissionTier = options.localGitExecOptions?.admissionTier
  const ghAccount = options.localGitExecOptions?.ghAccount
  const taskRepository = options.localGitExecOptions?.taskRepository
  const taskRemoteCandidates = options.localGitExecOptions?.taskRemoteCandidates
  return {
    ...(taskRepository ? { taskRepository } : {}),
    ...(taskRemoteCandidates ? { taskRemoteCandidates } : {}),
    ...(wslDistro ? { wslDistro } : {}),
    ...(admissionTier ? { admissionTier } : {}),
    ...(ghAccount ? { ghAccount } : {})
  }
}

export function hasHostedReviewLocalGitOptions(
  options: HostedReviewExecutionOptions = {}
): boolean {
  return Object.keys(getHostedReviewLocalGitOptions(options)).length > 0
}
