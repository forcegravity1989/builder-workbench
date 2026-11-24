import { agentSessionLeaseAdmitsWriter } from '../../../../../shared/agent-session-lease-adjudication'
import {
  formatOrcaSessionAddress,
  isOrcaSessionId,
  type OrcaSessionId
} from '../../../../../shared/agent-session/identity/orca-session-address'
import { getStructuredAgentSessionHost } from '../../../../native-chat/agent-session-wire/structured-agent-session-registry'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { canonicalOrchestrationSessionId } from '../../../orchestration/session-lineage'
import { structuredWorkerHostScope } from '../../../structured-worker-identity'
import type { RpcContext } from '../../core'

export type OrchestrationSessionCaller = {
  sessionId: OrcaSessionId
  workspaceId: string
}

/** Resolves a session claim made over the authenticated local CLI transport. */
export async function resolveOrchestrationSessionCaller(
  context: RpcContext,
  declaredAddress: string
): Promise<OrchestrationSessionCaller | null> {
  const evidence = context.orchestrationCompatibilityEvidence
  const claimed = evidence?.agentSessionId
  if (claimed === undefined) {
    return null
  }
  const effects = { effectsApplied: false }
  if (context.pairedDeviceId !== undefined || context.clientKind !== undefined || evidence?.host) {
    throw new OrchestrationError(
      'consumer_fenced',
      'An Orca session can only coordinate work on the host running that session.',
      effects
    )
  }
  if (!isOrcaSessionId(claimed) || declaredAddress !== formatOrcaSessionAddress(claimed)) {
    throw new OrchestrationError(
      'consumer_fenced',
      'The requested orchestration caller does not match the current Orca session.',
      effects
    )
  }
  await context.runtime.ensureStructuredAgentSessionHost()
  const store = getStructuredAgentSessionHost()?.deps.store
  const record = store?.getRecord(claimed)
  if (
    !store ||
    !record ||
    !structuredWorkerHostScope(record.location) ||
    !agentSessionLeaseAdmitsWriter(record.lease)
  ) {
    throw new OrchestrationError(
      'consumer_fenced',
      'The Orca session has no live local owner. Retry once the session is running.',
      effects
    )
  }
  const workspaceId = record.location.workspaceId
  return {
    sessionId: canonicalOrchestrationSessionId(claimed, store.listRecords(), workspaceId),
    workspaceId
  }
}
