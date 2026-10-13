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
import { cycleBranch } from './version-cycle/native-cycle-workspace'
import { prepareCycleRequest } from './version-cycle/native-session'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { callMetricRuntime, metricRuntimeRoute } from './metric-runtime-rpc'

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
export function nativeArchivePort(
  runtimeOwnerEnvironmentId?: string,
  prepare = prepareCycleRequest
): ArchivePort {
  return {
    async readStatus(input: ArchiveInput): Promise<ArchiveStatus> {
      const scope = {
        repoId: input.repoId,
        worktreeId: input.worktreeId,
        hostId: input.hostId
      }
      const owner = input.runtimeOwnerEnvironmentId ?? runtimeOwnerEnvironmentId
      const { target, ownerScope } = metricRuntimeRoute(scope, owner)
      const adopted = await callMetricRuntime<ArchiveProofResult>(
        scope,
        owner,
        'workbench.archive.proof',
        () => ({
          ...ownerScope,
          workflow: input.workflow,
          version: input.version,
          cycleId: input.cycleId,
          revision: input.revision
        }),
        60_000
      )
      if (adopted.proof.kind === 'verified') {
        const proof = adopted.proof.value
        const parts = proof.reference.repository.split('/')
        const host = parts.length === 3 ? parts.shift()! : 'github.com'
        return {
          kind: 'merged',
          reference: proof.reference,
          url: `https://${host}/${parts.join('/')}/pull/${proof.reference.number}`,
          checkedAt: proof.checkedAt,
          checks: 'unknown',
          review: 'unknown',
          mergeCommit: adopted.mergeCommit,
          proof: adopted.proof
        }
      }
      const branch = cycleBranch({ workflow: input.workflow })
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
        return adopted.changed
          ? { kind: 'changed', reason: adopted.proof.reason }
          : { kind: 'unknown', reason: adopted.proof.reason }
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
      const branch = cycleBranch({ workflow: input.workflow })
      const text = `请核对并归档 ${input.version} 当前已保存的${WORKFLOW_NAME[input.workflow]}（.bw/planning/${input.version}/${MATERIAL_FILE[input.workflow]}）：在当前 ${branch} 固定工作树内提交，推送远端 ${branch} 分支，创建由 ${branch} 到主分支的 PR/MR，给我链接；不要另建工作树或分支。`
      await prepare(session, text)
    }
  }
}
