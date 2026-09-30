import { getRepoExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { isCodeHubGitRemote, parseCodeHubRemote } from '../../shared/codehub'
import { CHARTER_BRANCH, PROJECT_TOML_REL } from '../../shared/workbench/project-charter'
import type { CharterStatus } from '../../shared/workbench/charter'
import { getHostedReviewForBranch } from '../source-control/hosted-review'
import { readGitBlobAtOidPath } from '../git/source-control/git-blob-read'
import { probeGitRemoteIdentity } from '../repo-git-remote-identity'
import { openCodeHubMrForBranch } from '../codehub/mr-creation'
import type { WorkbenchWorkspaceRepo } from './workspace-resolver'

type CharterGitExecOptions = { wslDistro?: string }

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
      const iid = await openCodeHubMrForBranch({ remote, execOptions, sourceBranch: CHARTER_BRANCH })
      return iid === null ? null : { provider: 'codehub', number: iid, url: null }
    }
    const review = await getHostedReviewForBranch({
      repoPath,
      executionHostId,
      branch: CHARTER_BRANCH,
      localGitExecOptions: execOptions
    })
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
): Promise<CharterStatus> {
  const executionHostId = getRepoExecutionHostId(repo as Repo)
  let headHasCharter = false
  try {
    const blob = await readGitBlobAtOidPath(repo.path, 'HEAD', PROJECT_TOML_REL, execOptions)
    headHasCharter = blob.exists && !blob.failed
  } catch {
    headHasCharter = false
  }
  const identityProbe = await probeGitRemoteIdentity(repo.path, executionHostId)
  if (identityProbe.status !== 'resolved') {
    return { pr: null, headHasCharter }
  }
  const identity = identityProbe.identity
  try {
    if (isCodeHubGitRemote(identity)) {
      const remote = parseCodeHubRemote(identity.remoteUrl)
      if (!remote) {
        return { pr: null, headHasCharter }
      }
      const iid = await openCodeHubMrForBranch({
        remote,
        execOptions,
        sourceBranch: CHARTER_BRANCH
      })
      return {
        pr: iid === null ? null : { provider: 'codehub', number: iid, url: null, state: 'open' },
        headHasCharter
      }
    }
    const review = await getHostedReviewForBranch({
      repoPath: repo.path,
      executionHostId,
      branch: CHARTER_BRANCH,
      localGitExecOptions: execOptions
    })
    if (!review) {
      return { pr: null, headHasCharter }
    }
    const state = review.state === 'merged' ? 'merged' : review.state === 'closed' ? 'closed' : 'open'
    return {
      pr: { provider: 'github', number: review.number, url: review.url || null, state },
      headHasCharter
    }
  } catch {
    return { pr: null, headHasCharter, queryFailed: true }
  }
}
