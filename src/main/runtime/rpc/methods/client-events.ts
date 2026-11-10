import { BROWSER_CLIENT_HOST_REQUEST_CAPABILITY } from '../../../../shared/browser/client-hosting/browser-client-host-request-protocol'
import { getBrowserHostRequestRegistry } from '../../browser-host/leases/browser-host-request-registry'
import { getRegisteredSshState, listRegisteredSshTargets } from '../../../ssh/ssh-target-registry'
import { getPublicSshState } from '../../public-ssh-state'
import { defineMethod, defineStreamingMethod } from '../core'
import {
  ClientEventsSubscribeParams,
  ClientEventsUnsubscribeParams
} from '../../../../shared/rpc-contract/client-events-params'

let clientEventSubscriptionSeq = 0

export const CLIENT_EVENT_METHODS = [
  defineStreamingMethod({
    name: 'runtime.clientEvents.subscribe',
    permission: 'workspace',
    params: ClientEventsSubscribeParams,
    handler: async (
      params,
      { runtime, connectionId, clientKind, pairedDeviceId, clientCapabilities },
      emit
    ) => {
      await new Promise<void>((resolve) => {
        // Why: mobile discards terminalSideEffects; excluding it stops the
        // per-OSC batch frames from crossing the relay.
        const unsubscribe = runtime.onClientEvent(
          (event) => {
            emit(event)
          },
          { consumesTerminalSideEffects: clientKind !== 'mobile' }
        )

        const unregisterHostVolunteer =
          params.browserHostRequests === true &&
          clientKind === 'runtime' &&
          pairedDeviceId &&
          clientCapabilities?.includes(BROWSER_CLIENT_HOST_REQUEST_CAPABILITY)
            ? getBrowserHostRequestRegistry(runtime).register({ pairedDeviceId, emit })
            : undefined

        const seq = ++clientEventSubscriptionSeq
        const subscriptionId = `runtime-client-events-${connectionId ?? 'inproc'}-${seq}`
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            unsubscribe()
            unregisterHostVolunteer?.()
            emit({ type: 'end' })
            resolve()
          },
          connectionId
        )

        // Why: listener-first snapshotting closes the subscribe race while restoring state missed during disconnects.
        for (const event of runtime.getTerminalSleepClientEventSnapshot?.() ?? []) {
          emit(event)
        }
        for (const event of runtime.getNativeChatLaunchDraftResolutionClientEventSnapshot?.() ??
          []) {
          emit(event)
        }
        const sshStates = listRegisteredSshTargets().flatMap((target) => {
          const state = getPublicSshState(getRegisteredSshState(target.id) ?? null)
          return state ? [{ targetId: target.id, state }] : []
        })
        // Why: attaching the listener before snapshotting closes the reload gap without exposing HUB-private target configuration.
        emit({ type: 'ready', subscriptionId, snapshot: { sshStates } })
      })
    }
  }),
  defineMethod({
    name: 'runtime.clientEvents.unsubscribe',
    permission: 'workspace',
    params: ClientEventsUnsubscribeParams,
    handler: async (params, { runtime, connectionId }) => {
      const expectedPrefix = `runtime-client-events-${connectionId ?? 'inproc'}-`
      if (!params.subscriptionId.startsWith(expectedPrefix)) {
        return { unsubscribed: false }
      }
      runtime.cleanupSubscription(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]
