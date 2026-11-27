import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { getRuntimeEnvironmentStatus } from '@/runtime/rpc/compatibility/runtime-compatibility-probe'
import type {
  ReviewPeerTarget,
  ReviewPeerDelivery
} from '../../../../shared/workbench/pr-review-request'
import type {
  PrototypeReviewIncomingRequest,
  PrototypeReviewRequest
} from '../../../../shared/workbench/prototype-review-request'

export const readPrototypeReviewInbox = () =>
  callRuntimeRpc<PrototypeReviewIncomingRequest[]>(
    { kind: 'local' },
    'workbench.prototypeReview.inbox'
  )

export const dismissPrototypeReviewInbox = (eventId: string, seenReceivedAt: string) =>
  callRuntimeRpc<{ dismissed: boolean }>({ kind: 'local' }, 'workbench.prototypeReview.dismiss', {
    eventId,
    seenReceivedAt
  })

export const readPrototypeReviewSender = () =>
  callRuntimeRpc<{ sender: string }>({ kind: 'local' }, 'workbench.prototypeReview.identity')

export type PrototypeReviewSendResult = {
  sentAt: string
  results: ReviewPeerDelivery[]
}

async function resolveSourceRuntimeId(sourceEnvironmentId: string): Promise<string | undefined> {
  if (sourceEnvironmentId === 'local') {
    const status = await callRuntimeRpc<{ runtimeId?: string }>({ kind: 'local' }, 'status.get')
    return status.runtimeId
  }
  try {
    return (await getRuntimeEnvironmentStatus(sourceEnvironmentId)).runtimeId
  } catch {
    return undefined
  }
}

export async function enrichPrototypeReviewPage(
  page: PrototypeReviewRequest['page']
): Promise<PrototypeReviewRequest['page']> {
  if (page.sourceRuntimeId) {
    return page
  }
  const sourceRuntimeId = await resolveSourceRuntimeId(page.sourceEnvironmentId)
  return sourceRuntimeId ? { ...page, sourceRuntimeId } : page
}

export async function deliverPrototypeReviewRequest(
  request: PrototypeReviewRequest,
  targets: ReviewPeerTarget[]
): Promise<PrototypeReviewSendResult> {
  const snapshots = await window.api.runtimeEnvironments.getStatusSnapshots()
  const results: ReviewPeerDelivery[] = []
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
      const response = await callRuntimeRpc<{ accepted: boolean }>(
        { kind: 'environment', environmentId: target.environmentId },
        'workbench.prototypeReview.receive',
        request,
        {
          timeoutMs: 15_000,
          expectedEnvironmentPairingRevision: target.pairingRevision,
          expectedEnvironmentRuntimeId: snapshot.status.runtimeId
        }
      )
      if (!response.accepted) {
        throw new Error('主机未确认保存原型评审通知')
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
