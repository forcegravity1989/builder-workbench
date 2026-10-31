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
import { readCodeHubBranchReview } from '../codehub/mr-branch-review'
import { runTrunkBaseline } from './trunk-baseline'
import type { WorkbenchWorkspaceRepo } from './workspace-resolver'

type CharterGitExecOptions = { wslDistro?: string }

async function readProjectBranchHead(
  repoPath: string,
  executionHostId: ExecutionHostId,
  execOptions: CharterGitExecOptions
): Promise<string | null> {
  if (parseExecutionHostId(executionHostId)?.kind === 'ssh') {
    return null
  }
  const { stdout } = await gitExecFileAsync(
    ['for-each-ref', '--format=%(objectname)', `refs/heads/${CHARTER_BRANCH}`],
    { ...execOptions, cwd: repoPath, timeout: 30_000 }
  )
  return stdout.trim() || null
}

async function readProjectBranchReview(
  repoPath: string,
  executionHostId: ExecutionHostId,
  execOptions: CharterGitExecOptions
) {
  const headOid = await readProjectBranchHead(repoPath, executionHostId, execOptions)
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

async function charterTargetBranch(
  repoPath: string,
  pinnedRef: string | null,
  execOptions: CharterGitExecOptions
): Promise<string> {
  const baseline = await runTrunkBaseline(repoPath, pinnedRef, execOptions)
  if (!baseline.sync) {
    throw new Error('项目基线不是可核对的 MR 目标分支')
  }
  return baseline.sync.branchName
}

/** bw/project 上开放中的名片 PR/MR；CodeHub 查询失败不得冒充无 MR。 */
export async function lookupOpenCharterPr(
  repo: WorkbenchWorkspaceRepo,
  executionHostId: ExecutionHostId,
  identity: { remoteUrl: string; canonicalKey: string },
  execOptions: CharterGitExecOptions
): Promise<{ provider: 'github' | 'codehub'; number: number; url: string | null } | null> {
  if (isCodeHubGitRemote(identity)) {
    if (parseExecutionHostId(executionHostId)?.kind === 'ssh') {
      throw new Error('CodeHub 名片 MR 读取尚不支持 SSH 宿主')
    }
    const remote =
      parseCodeHubRemote(identity.remoteUrl) ?? parseCodeHubRemote(identity.canonicalKey)
    if (!remote) {
      throw new Error('未解析项目的真实 CodeHub 来源')
    }
    const review = await readCodeHubBranchReview({
      remote,
      execOptions: { ...execOptions, cwd: repo.path },
      sourceBranch: CHARTER_BRANCH,
      targetBranch: await charterTargetBranch(repo.path, repo.worktreeBaseRef ?? null, execOptions),
      states: ['opened']
    })
    return review === null ? null : { provider: 'codehub', number: review.number, url: review.url }
  }
  try {
    const { review } = await readProjectBranchReview(repo.path, executionHostId, execOptions)
    if (!review || (review.state !== 'open' && review.state !== 'draft')) {
      return null
    }
    return { provider: 'github', number: review.number, url: review.url || null }
  } catch {
    return null
  }
}

async function readCodeHubProjectBranchReview(
  repo: WorkbenchWorkspaceRepo,
  executionHostId: ExecutionHostId,
  identity: { remoteUrl: string; canonicalKey: string },
  execOptions: CharterGitExecOptions
) {
  if (parseExecutionHostId(executionHostId)?.kind === 'ssh') {
    throw new Error('CodeHub 名片 MR 读取尚不支持 SSH 宿主')
  }
  const remote = parseCodeHubRemote(identity.remoteUrl) ?? parseCodeHubRemote(identity.canonicalKey)
  if (!remote) {
    throw new Error('未解析项目的真实 CodeHub 来源')
  }
  const headOid = await readProjectBranchHead(repo.path, executionHostId, execOptions)
  const review = await readCodeHubBranchReview({
    remote,
    execOptions: { ...execOptions, cwd: repo.path },
    sourceBranch: CHARTER_BRANCH,
    targetBranch: await charterTargetBranch(repo.path, repo.worktreeBaseRef ?? null, execOptions),
    currentHeadOid: headOid
  })
  return { review, headOid }
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
    const provider = isCodeHubGitRemote(identity) ? 'codehub' : 'github'
    const { review, headOid } =
      provider === 'codehub'
        ? await readCodeHubProjectBranchReview(repo, executionHostId, identity, execOptions)
        : await readProjectBranchReview(repo.path, executionHostId, execOptions)
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
      pr: { provider, number: review.number, url: review.url || null, state },
      headHasCharter,
      headMatchesProposal,
      mergedHeadOid:
        state === 'merged' &&
        headOid &&
        (('headSha' in review && review.headSha === headOid) ||
          review.confirmedContainedHeadOid === headOid)
          ? headOid
          : undefined,
      remoteAvailable
    }
  } catch {
    return { pr: null, headHasCharter, remoteAvailable, queryFailed: true }
  }
}
