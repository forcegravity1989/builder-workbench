import type { OrcaRuntimeService } from '../orca-runtime'
import { ORCA_SESSION_ADDRESS_PREFIX } from '../../../shared/agent-session/identity/orca-session-address-prefix'
import type { RpcContext, RpcMethod, RpcRequest } from './core'
import { routeDispatcherClientHostedBrowserRpc } from './dispatcher-client-browser-routing'
import { needsLocalCallerFingerprint } from './dispatcher-caller-fingerprint'
import type {
  LegacyCompatibilityRoute,
  OrchestrationLegacyCompatibility
} from './orchestration-legacy-compatibility'
import type {
  DurableMutationInvocation,
  OrchestrationMutationExecutor
} from './orchestration-mutation-executor'
import { recordRuntimeFeatureInteraction } from './runtime-feature-interaction'
import { resolveOrchestrationSessionCaller } from './orchestration/callers/orchestration-session-caller'

const SESSION_CALLER_PARAMS: Partial<Record<string, string>> = {
  'orchestration.runCreate': 'from',
  'orchestration.runCurrent': 'from',
  'orchestration.runUse': 'from',
  'orchestration.workerStart': 'from',
  'orchestration.check': 'terminal',
  'orchestration.reply': 'from',
  'orchestration.taskCreate': 'callerTerminalHandle',
  'orchestration.taskList': 'callerTerminalHandle',
  'orchestration.taskUpdate': 'callerTerminalHandle'
}

type DispatcherUnaryMethodInvocation = {
  runtime: OrcaRuntimeService
  request: RpcRequest
  method: RpcMethod
  params: unknown
  context: RpcContext
  orchestrationMutations: OrchestrationMutationExecutor
  legacyOrchestration: OrchestrationLegacyCompatibility
}

export async function invokeDispatcherUnaryMethod({
  runtime,
  request,
  method,
  params,
  context,
  orchestrationMutations,
  legacyOrchestration
}: DispatcherUnaryMethodInvocation): Promise<unknown> {
  const clientHostedBrowser = await routeDispatcherClientHostedBrowserRpc(
    runtime,
    request.method,
    params
  )
  if (clientHostedBrowser.handled) {
    recordRuntimeFeatureInteraction(
      runtime,
      request.method,
      clientHostedBrowser.result,
      undefined,
      request.params
    )
    return clientHostedBrowser.result
  }

  const callerParam = SESSION_CALLER_PARAMS[request.method]
  const declaredAddress =
    callerParam && params !== null && typeof params === 'object'
      ? (params as Record<string, unknown>)[callerParam]
      : undefined
  const sessionCaller =
    request.orchestrationCompatibilityEvidence?.agentSessionId !== undefined &&
    typeof declaredAddress === 'string' &&
    declaredAddress.startsWith(ORCA_SESSION_ADDRESS_PREFIX)
      ? await resolveOrchestrationSessionCaller(
          {
            ...context,
            orchestrationCompatibilityEvidence: request.orchestrationCompatibilityEvidence
          },
          declaredAddress
        )
      : null
  const compatibility: LegacyCompatibilityRoute = sessionCaller
    ? { handled: false }
    : await legacyOrchestration.tryHandle(request, params, context.signal)
  if (compatibility.handled) {
    return compatibility.result
  }
  const effectiveParams = compatibility.params ?? params
  const legacyCoordinator = legacyOrchestration.createCoordinatorInvocation(
    request,
    compatibility.legacyCoordinatorAuthority
  )
  const authenticatedCallerFingerprint =
    (sessionCaller ? `orca-session:${sessionCaller.sessionId}` : undefined) ??
    context.authenticatedCallerFingerprint ??
    legacyCoordinator?.mutationCallerFingerprint ??
    (needsLocalCallerFingerprint(request, effectiveParams)
      ? orchestrationMutations.getLocalAuthenticatedCallerFingerprint()
      : undefined)
  const invoke = (mutation?: DurableMutationInvocation) => {
    const legacyCoordinatorRunId = legacyCoordinator?.revalidate()
    return method.handler(effectiveParams, {
      ...context,
      orchestrationSessionCaller: sessionCaller ?? undefined,
      authenticatedCallerFingerprint:
        mutation?.identity.callerFingerprint ?? authenticatedCallerFingerprint,
      recordMutationReceipt: mutation?.recordReceipt,
      markWorkerDoneMutationEffectFree: mutation?.markWorkerDoneEffectFree,
      markMutationEffectPossible: mutation?.markEffectPossible,
      orchestrationMutation: mutation?.identity,
      replayedMutationReceipt: mutation?.replayedReceipt,
      legacyCoordinatorRunId,
      legacyCoordinatorAuthority: legacyCoordinator?.authority,
      revalidateLegacyCoordinator: legacyCoordinator?.revalidate,
      orchestrationCompatibilityCallerAuthority:
        compatibility.orchestrationCompatibilityCallerAuthority,
      orchestrationCompatibilityEvidence: request.orchestrationCompatibilityEvidence
    })
  }
  const result = await orchestrationMutations.run(
    request,
    effectiveParams,
    invoke,
    legacyCoordinator?.mutationCallerFingerprint ?? authenticatedCallerFingerprint
  )
  recordRuntimeFeatureInteraction(runtime, request.method, result, undefined, request.params)
  return result
}
