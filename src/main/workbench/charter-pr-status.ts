import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { isCodeHubGitRemote, parseCodeHubRemote } from '../../shared/codehub'
import { CHARTER_BRANCH, PROJECT_TOML_REL } from '../../shared/workbench/project-charter'
import type { CharterStatus } from '../../shared/workbench/charter'
import { getHostedReviewForBranch } from '../source-control/hosted-review'
import { readGitBlobAtOidPath } from '../git/source-control/git-blob-read'
import { gitExecFileAsync } from '../git/runner'
import { probeGitRemoteIdentity } from '../repo-git-remote-identity'
import { openCodeHubMrForBranch } from '../codehub/mr-creation'
import type { WorkbenchWorkspaceRepo } from './workspace-resolver'

type CharterGitExecOptions = { wslDistro?: string }

async function readProjectBranchReview(
  repoPath: string,
  executionHostId: ExecutionHostId,
  execOptions: CharterGitExecOptions
) {
  let headOid: string | null = null
  if (parseExecutionHostId(executionHostId)?.kind !== 'ssh') {
    const { stdout } = await gitExecFileAsync(
      ['for-each-ref', '--format=%(objectname)', `refs/heads/${CHARTER_BRANCH}`],
      { ...execOptions, cwd: repoPath, timeout: 30_000 }
    )
    headOid = stdout.trim() || null
  }
  // The provider's merged-review visibility must use the material branch, not the main checkout.
  const review = await getHostedReviewForBranch({
    repoPath,
    executionHostId,
    branch: CHARTER_BRANCH,
    currentHeadOid: headOid,
    localGitExecOptions: execOptions
  })
  return { review, headOid }
}

/** bw/project 上开放中的名片 PR/MR;查不到或查询失败都返回 null(调用方按无 PR 呈现)。 */
export async function lookupOpenCharterPr(
  repoPath: string,
  executionHostId: ExecutionHostId,
  identity: { remoteUrl: string; canonicalKey: string },
  execOptions: CharterGitExecOptions
): Promise<{ provider: 'github' | 'codehub'; number: number; url: string | null } | null> {
  try {
    if (isCodeHubGitRemote(identity)) {
      const remote = parseCodeHubRemote(identity.remoteUrl)
      if (!remote) {
        return null
      }
      const iid = await openCodeHubMrForBranch({
        remote,
        execOptions,
        sourceBranch: CHARTER_BRANCH
      })
      return iid === null ? null : { provider: 'codehub', number: iid, url: null }
    }
    const { review } = await readProjectBranchReview(repoPath, executionHostId, execOptions)
    if (!review || (review.state !== 'open' && review.state !== 'draft')) {
      return null
    }
    return { provider: 'github', number: review.number, url: review.url || null }
  } catch {
    return null
  }
}

/**
 * 墙卡/总览 chip 数据:bw/project 上的 PR 状态 + 主检出 HEAD 是否已含名片。
 * 查询失败按 queryFailed 上报——「没查成」不冒充「没有 PR」。
 */
export async function readCharterStatus(
  repo: WorkbenchWorkspaceRepo,
  execOptions: CharterGitExecOptions
): Promise<CharterStatus & { mergedHeadOid?: string }> {
  const executionHostId = getRepoExecutionHostId(repo as Repo)
  let headHasCharter = false
  let headContent: string | null = null
  try {
    const blob = await readGitBlobAtOidPath(repo.path, 'HEAD', PROJECT_TOML_REL, execOptions)
    headHasCharter = blob.exists && !blob.failed
    headContent = headHasCharter ? blob.content : null
  } catch {
    headHasCharter = false
  }
  const identityProbe = await probeGitRemoteIdentity(repo.path, executionHostId)
  const remoteAvailable =
    identityProbe.status === 'resolved' ? true : identityProbe.status === 'no-remote' ? false : null
  if (identityProbe.status !== 'resolved') {
    return { pr: null, headHasCharter, remoteAvailable }
  }
  const identity = identityProbe.identity
  try {
    if (isCodeHubGitRemote(identity)) {
      const remote = parseCodeHubRemote(identity.remoteUrl)
      if (!remote) {
        return { pr: null, headHasCharter, remoteAvailable }
      }
      const iid = await openCodeHubMrForBranch({
        remote,
        execOptions,
        sourceBranch: CHARTER_BRANCH
      })
      return {
        pr: iid === null ? null : { provider: 'codehub', number: iid, url: null, state: 'open' },
        headHasCharter,
        remoteAvailable
      }
    }
    const { review, headOid } = await readProjectBranchReview(
      repo.path,
      executionHostId,
      execOptions
    )
    if (!review) {
      return { pr: null, headHasCharter, remoteAvailable }
    }
    const state =
      review.state === 'merged' ? 'merged' : review.state === 'closed' ? 'closed' : 'open'
    let headMatchesProposal: boolean | undefined
    if (state === 'merged') {
      try {
        const proposed = await readGitBlobAtOidPath(
          repo.path,
          CHARTER_BRANCH,
          PROJECT_TOML_REL,
          execOptions
        )
        headMatchesProposal =
          proposed.exists && !proposed.failed && proposed.content === headContent
      } catch {
        headMatchesProposal = undefined
      }
    }
    return {
      pr: { provider: 'github', number: review.number, url: review.url || null, state },
      headHasCharter,
      headMatchesProposal,
      mergedHeadOid:
        state === 'merged' &&
        headOid &&
        (review.headSha === headOid || review.confirmedContainedHeadOid === headOid)
          ? headOid
          : undefined,
      remoteAvailable
    }
  } catch {
    return { pr: null, headHasCharter, remoteAvailable, queryFailed: true }
  }
}
