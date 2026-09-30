import type { HostedReviewInfo } from '../../../shared/hosted-review'
import type { PRReviewDecision } from '../../../shared/github/pull-request-types'
import { githubRepoIdentityKey } from '../../../shared/github/repository-identity-key'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import type { Repo } from '../../../shared/repo-types'
import {
  CODEHUB_ARCHIVE_UNPROVABLE_REASON,
  type ArchiveProofResult,
  type ArchiveReference,
  type ArchiveStatus
} from '../../../shared/workbench/version-archive'
import type { ArchiveInput, ArchivePort, CycleSession } from './version-cycle/ports'
import { prepareCycleRequest } from './version-cycle/native-session'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { callMetricRuntime, metricRuntimeRoute } from './metric-runtime-rpc'

const WORKFLOW_BRANCH = { plan: 'bw/week-plan', acceptance: 'bw/week-acceptance' } as const
const WORKFLOW_NAME = { plan: '版本计划', acceptance: '版本验收' } as const
const MATERIAL_FILE = { plan: 'data.json', acceptance: 'acceptance.json' } as const

function mapChecks(
  status: HostedReviewInfo['status']
): 'unknown' | 'pending' | 'passed' | 'failed' {
  switch (status) {
    case 'success':
      return 'passed'
    case 'failure':
      return 'failed'
    case 'pending':
      return 'pending'
    case 'neutral':
      return 'unknown'
  }
}

function mapReview(
  decision: PRReviewDecision | null | undefined
): 'unknown' | 'pending' | 'approved' | 'changes-requested' {
  switch (decision) {
    case 'APPROVED':
      return 'approved'
    case 'CHANGES_REQUESTED':
      return 'changes-requested'
    case 'REVIEW_REQUIRED':
      return 'pending'
    case null:
    case undefined:
      return 'unknown'
  }
}

/**
 * Archive status from captured identity only: the fixed workflow branch of the
 * registered repo, read on the worktree's owning runtime — never the current
 * focus, never a default GitHub remote. Provider facts stay provider-reported;
 * proof additionally requires the merged commit's material bytes to match the
 * exact requested revision, so anything unverifiable stays Unknown instead of
 * turning green.
 */
export function nativeArchivePort(runtimeOwnerEnvironmentId?: string): ArchivePort {
  return {
    async readStatus(input: ArchiveInput): Promise<ArchiveStatus> {
      const scope = {
        repoId: input.repoId,
        worktreeId: input.worktreeId,
        hostId: input.hostId
      }
      const owner = input.runtimeOwnerEnvironmentId ?? runtimeOwnerEnvironmentId
      const { target, ownerScope } = metricRuntimeRoute(scope, owner)
      const branch = WORKFLOW_BRANCH[input.workflow]
      const review = await callRuntimeRpc<HostedReviewInfo | null>(
        target,
        'hostedReview.forBranch',
        {
          repo: ownerScope.repoId,
          branch,
          ...(input.reference?.provider === 'github'
            ? { linkedGitHubPR: input.reference.number }
            : {})
        },
        { timeoutMs: 30_000 }
      )
      const checkedAt = new Date().toISOString()
      if (!review) {
        const { repo } = await callRuntimeRpc<{ repo: Repo }>(
          target,
          'repo.show',
          { repo: ownerScope.repoId },
          { timeoutMs: 30_000 }
        )
        if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
          return {
            kind: 'unknown',
            reason: CODEHUB_ARCHIVE_UNPROVABLE_REASON
          }
        }
        return { kind: 'not-created', checkedAt }
      }
      if (review.provider !== 'github' || !review.githubRepository) {
        return {
          kind: 'unknown',
          reason: `${review.provider} 评审缺少可核对的仓库身份，归档证据暂无法读回`
        }
      }
      const reference: ArchiveReference = {
        provider: 'github',
        repository: githubRepoIdentityKey(review.githubRepository),
        number: review.number,
        materialRevision: input.revision
      }
      const status = {
        kind:
          review.state === 'merged'
            ? ('merged' as const)
            : review.state === 'closed'
              ? ('closed' as const)
              : ('open' as const),
        reference,
        url: review.url,
        checkedAt,
        checks: mapChecks(review.status),
        review: mapReview(review.reviewDecision)
      }
      if (status.kind !== 'merged') {
        return { ...status, mergeCommit: null, proof: { kind: 'unknown', reason: '评审尚未合入' } }
      }
      const proof = await callMetricRuntime<ArchiveProofResult>(
        scope,
        owner,
        'workbench.archive.proof',
        () => ({
          ...ownerScope,
          workflow: input.workflow,
          provider: reference.provider,
          repository: reference.repository,
          number: reference.number,
          version: input.version,
          cycleId: input.cycleId,
          revision: input.revision
        }),
        60_000
      )
      return { ...status, mergeCommit: proof.mergeCommit, proof: proof.proof }
    },

    async prepareRequest(input: ArchiveInput, session: CycleSession): Promise<void> {
      const branch = WORKFLOW_BRANCH[input.workflow]
      const text = [
        `请按项目流程归档本轮${WORKFLOW_NAME[input.workflow]}材料：`,
        `- 版本：${input.version}；周期：${input.cycleId}`,
        `- 材料：.bw/planning/${input.version}/${MATERIAL_FILE[input.workflow]}（修订 ${input.revision}）`,
        `- 分支：${branch}，目标为项目正式采用基线`,
        '请先核对材料修订与上述一致，再按项目门禁与授权提交 PR/MR，回显链接与实际状态。',
        '合入由人决定；不自动合入、不代关 Issue、不把合入当作目标达成。'
      ].join('\n')
      await prepareCycleRequest(session, text)
    }
  }
}
