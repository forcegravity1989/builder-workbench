import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type {
  ReviewIncomingRequest,
  ReviewPeerTarget,
  ReviewRepoIdentity,
  ReviewRequestPayload,
  ReviewSendResult
} from '../../../../shared/workbench/pr-review-request'

export const readReviewInbox = () =>
  callRuntimeRpc<ReviewIncomingRequest[]>({ kind: 'local' }, 'workbench.review.inbox')

export const readReviewSender = () =>
  callRuntimeRpc<{ sender: string }>({ kind: 'local' }, 'workbench.review.identity')

export async function discoverReviewTargets(repo: ReviewRepoIdentity): Promise<ReviewPeerTarget[]> {
  const [environments, snapshots] = await Promise.all([
    window.api.runtimeEnvironments.list(),
    window.api.runtimeEnvironments.getStatusSnapshots()
  ])
  const targets: ReviewPeerTarget[] = []
  const failures: string[] = []
  // Bounded sequential probes reuse authenticated connections; discovery never opens a disconnected host.
  for (const environment of environments) {
    const revision = environment.pairingRevision ?? environment.createdAt
    const snapshot = snapshots.find(
      (item) => item.environmentId === environment.id && item.pairingRevision === revision
    )
    if (
      !snapshot ||
      snapshot.retired ||
      snapshot.verification !== 'verified' ||
      snapshot.transport !== 'ready' ||
      !snapshot.status?.runtimeId
    ) {
      continue
    }
    const target = {
      environmentId: environment.id,
      name: environment.name,
      pairingRevision: revision
    }
    try {
      const result = await callRuntimeRpc<{ available: boolean }>(
        { kind: 'environment', environmentId: target.environmentId },
        'workbench.review.project',
        repo,
        {
          timeoutMs: 10_000,
          expectedEnvironmentPairingRevision: revision,
          expectedEnvironmentRuntimeId: snapshot.status?.runtimeId
        }
      )
      if (result.available) {
        targets.push(target)
      }
    } catch (error) {
      failures.push(
        `${environment.name}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  // An incomplete recipient set must not silently become "all same-project hosts".
  if (failures.length) {
    throw new Error(`无法确认同项目主机，尚未发送：${failures.join('；')}`)
  }
  return targets
}

export async function deliverReviewRequest(
  request: ReviewRequestPayload,
  targets: ReviewPeerTarget[]
): Promise<ReviewSendResult> {
  const snapshots = await window.api.runtimeEnvironments.getStatusSnapshots()
  const results: ReviewSendResult['results'] = []
  for (const target of targets) {
    try {
      const snapshot = snapshots.find(
        (item) =>
          item.environmentId === target.environmentId &&
          item.pairingRevision === target.pairingRevision
      )
      if (
        !snapshot ||
        snapshot.retired ||
        snapshot.verification !== 'verified' ||
        snapshot.transport !== 'ready' ||
        !snapshot.status?.runtimeId
      ) {
        throw new Error('主机未连接或配对已变更')
      }
      const result = await callRuntimeRpc<{ accepted: boolean }>(
        { kind: 'environment', environmentId: target.environmentId },
        'workbench.review.receive',
        request,
        {
          timeoutMs: 15_000,
          expectedEnvironmentPairingRevision: target.pairingRevision,
          expectedEnvironmentRuntimeId: snapshot.status.runtimeId
        }
      )
      if (!result.accepted) {
        throw new Error('主机未确认保存通知')
      }
      results.push({ ...target, ok: true })
    } catch (error) {
      results.push({
        ...target,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return { sentAt: request.sentAt, results }
}
