import { getRepoExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { CHARTER_BRANCH } from '../../shared/workbench/project-charter'
import { milestoneDraft, type MilestoneRead } from '../../shared/workbench/project-milestones'
import { getHostedReviewForBranch } from '../source-control/hosted-review'
import { readCharterStatus } from './charter-pr-status'
import { readMilestoneSnapshot } from './milestone-snapshot'
import type { WorkbenchWorkspaceRepo } from './workspace-resolver'

export async function isMilestoneAncestor(
  git: (args: string[]) => Promise<string>,
  from: string,
  to: string
): Promise<boolean> {
  try {
    await git(['merge-base', '--is-ancestor', from, to])
    return true
  } catch (error) {
    if ((error as { code?: number }).code === 1) {
      return false
    }
    throw error
  }
}

export async function readMilestoneSources(c: {
  repo: WorkbenchWorkspaceRepo
  options: { wslDistro?: string }
  started: Set<string>
  baseline: { commit: string }
  branchHead: string | null
  git(args: string[]): Promise<string>
}): Promise<MilestoneRead> {
  const formal = await readMilestoneSnapshot(c.repo.path, c.baseline.commit, c.options, c.started)
  const incorporated = c.branchHead
    ? await isMilestoneAncestor(c.git, c.branchHead, c.baseline.commit)
    : true
  const status = await readCharterStatus(c.repo, c.options)
  const diverged =
    !incorporated &&
    c.branchHead &&
    !(await isMilestoneAncestor(c.git, c.baseline.commit, c.branchHead))
  let sourceNotice: string | undefined
  let mergedHead = false
  if (!incorporated && status.pr?.state === 'merged') {
    try {
      const review = await getHostedReviewForBranch({
        repoPath: c.repo.path,
        executionHostId: getRepoExecutionHostId(c.repo as Repo),
        branch: CHARTER_BRANCH,
        currentHeadOid: c.branchHead,
        localGitExecOptions: c.options
      })
      mergedHead =
        review?.state === 'merged' &&
        (review.headSha === c.branchHead || review.confirmedContainedHeadOid === c.branchHead)
    } catch {
      /* A failed remote lookup cannot prove a proposal is current. */
    }
    if (mergedHead && c.branchHead) {
      const merged = await readMilestoneSnapshot(c.repo.path, c.branchHead, c.options, c.started)
      if (
        JSON.stringify(milestoneDraft(merged.snapshot)) ===
        JSON.stringify(milestoneDraft(formal.snapshot))
      ) {
        sourceNotice = '正式安排已更新；项目材料分支需在原生会话同步主干后继续提交。'
        mergedHead = false
      }
    }
    sourceNotice ??= mergedHead
      ? '项目材料分支已合入，需更新主干并在原生会话同步项目材料分支；当前展示本机正式安排。'
      : '已合入评审与当前材料分支的修订尚未核对，请在原生会话核对；当前展示正式安排。'
  }
  if (diverged && !sourceNotice) {
    sourceNotice =
      '项目材料分支与主干已分叉，请在原生会话同步后继续；当前展示正式安排，未读取旧分支作为草案。'
  }
  const branch =
    !incorporated && !sourceNotice && c.branchHead
      ? await readMilestoneSnapshot(c.repo.path, c.branchHead, c.options, c.started)
      : null
  return {
    formal: formal.snapshot,
    branchHead: c.branchHead,
    sourceNotice,
    mergedProposal: mergedHead,
    proposal:
      branch &&
      JSON.stringify(milestoneDraft(branch.snapshot)) !==
        JSON.stringify(milestoneDraft(formal.snapshot))
        ? branch.snapshot
        : null,
    review: {
      pr: status.pr,
      queryFailed: status.queryFailed,
      remoteAvailable: status.remoteAvailable
    }
  }
}
