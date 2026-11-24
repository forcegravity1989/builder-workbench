import type { WebSocket } from 'ws'
import type {
  PairingGetEndpointsParams,
  PairingProvisionRelayParams
} from '../../../shared/mobile-relay-credential-contract'
import { fingerprintAuthenticatedPairingCredential } from '../rpc/orchestration-mutation-executor'
import type { AuthenticatedMobileSocket } from '../rpc/mobile-socket-wiring'
import type { RpcRequest, RpcResponse } from '../rpc/core'
import type { WebSocketTransport } from '../rpc/ws-transport'
import { effectiveRuntimeAccessMode, type DeviceScope } from '../device-registry'
import { RuntimeRpcRequestAdmission } from './runtime-rpc-request-admission'
import { classifyRuntimeLongPoll } from './runtime-rpc-long-poll'
import { MOBILE_RPC_METHOD_ALLOWLIST } from './runtime-rpc-mobile-method-allowlist'
import {
  isQuietTeamReadDenial,
  isRoutineReadRuntimeMethod,
  teamReadDenialReason,
  teamReadParamsDenialReason,
  teamReadRequestParams,
  teamReadTerminalStreamHandler
} from './runtime-rpc-team-read-policy'

// Why: status.get has no per-connection context in the dispatcher, so stamp the scope here at the transport boundary.
function injectDeviceScope(response: string, scope: DeviceScope): string {
  try {
    const parsed = JSON.parse(response) as RpcResponse
    if (parsed.ok !== true || typeof parsed.result !== 'object' || parsed.result === null) {
      return response
    }
    ;(parsed.result as Record<string, unknown>).deviceScope = scope
    return JSON.stringify(parsed)
  } catch {
    return response
  }
}

export class RuntimeRpcWebSocketDispatch extends RuntimeRpcRequestAdmission {
  // Why: WebSocket dispatch is streaming (multiple responses) and auths via per-device tokens, not the shared token.
  protected async handleWebSocketMessage(
    rawMessage: string,
    reply: (response: string) => void,
    sendBinary: (response: Uint8Array<ArrayBufferLike>) => boolean | void,
    wsTransport?: WebSocketTransport,
    ws?: WebSocket,
    authenticatedDeviceToken?: string | null,
    authenticatedSocket?: AuthenticatedMobileSocket
  ): Promise<void> {
    let request: RpcRequest
    try {
      request = JSON.parse(rawMessage) as RpcRequest
    } catch {
      reply(JSON.stringify(this.buildError('unknown', 'bad_request', 'Invalid JSON request')))
      return
    }

    if (typeof request.id !== 'string' || request.id.length === 0) {
      reply(JSON.stringify(this.buildError('unknown', 'bad_request', 'Missing request id')))
      return
    }
    if (typeof request.method !== 'string' || request.method.length === 0) {
      reply(JSON.stringify(this.buildError(request.id, 'bad_request', 'Missing RPC method')))
      return
    }

    const requestToken =
      typeof (request as Record<string, unknown>).deviceToken === 'string'
        ? ((request as Record<string, unknown>).deviceToken as string)
        : null
    if (authenticatedDeviceToken && requestToken && requestToken !== authenticatedDeviceToken) {
      reply(JSON.stringify(this.buildError(request.id, 'unauthorized', 'Device token mismatch')))
      return
    }
    // Why: E2EE already authenticated the channel; authorize by that bound identity, not a repeated request field.
    const token = authenticatedDeviceToken ?? requestToken
    if (!token) {
      reply(JSON.stringify(this.buildError(request.id, 'unauthorized', 'Missing device token')))
      return
    }
    const tokenDevice = this.deviceRegistry?.validateToken(token)
    // Why: a shared team link resolves to the member record chosen at authentication; every later
    // check (access mode, audit, grants) belongs to that member rather than the shared link.
    const device =
      tokenDevice &&
      authenticatedSocket &&
      authenticatedSocket.device.deviceId !== tokenDevice.deviceId
        ? (this.deviceRegistry?.getDevice(authenticatedSocket.device.deviceId) ?? tokenDevice)
        : tokenDevice
    if (!device) {
      reply(JSON.stringify(this.buildError(request.id, 'unauthorized', 'Invalid device token')))
      return
    }
    if (device.scope === 'mobile' && !MOBILE_RPC_METHOD_ALLOWLIST.has(request.method)) {
      reply(
        JSON.stringify(
          this.buildError(
            request.id,
            'forbidden',
            `Method '${request.method}' is not available to mobile clients`
          )
        )
      )
      return
    }
    const accessMode = effectiveRuntimeAccessMode(device)
    const teamReadDenial =
      teamReadDenialReason(accessMode, request.method) ??
      teamReadParamsDenialReason(accessMode, request.method, request.params)
    if (teamReadDenial) {
      if (!isQuietTeamReadDenial(request.method)) {
        this.getRuntimeAccessAudit().record({
          at: Date.now(),
          deviceId: device.deviceId,
          deviceName: device.name,
          accessMode,
          ...(device.teamBinding
            ? { teamGroupId: device.teamBinding.teamGroupId, memberId: device.teamBinding.memberId }
            : undefined),
          method: request.method,
          result: 'denied',
          requestId: request.id
        })
      }
      reply(JSON.stringify(this.buildError(request.id, 'forbidden', teamReadDenial)))
      return
    }
    const teamReadParams = teamReadRequestParams(accessMode, request.method, request.params)
    if (teamReadParams !== request.params) {
      request = { ...request, params: teamReadParams }
    }

    // Why: bind deviceToken to this socket so ws.on('close') knows which mobile client disconnected.
    if (wsTransport && ws) {
      wsTransport.setClientId(ws, token)
    }

    const longPoll = classifyRuntimeLongPoll(request)
    const rejection = this.admitLongPoll(longPoll, device.deviceId)
    if (rejection) {
      reply(JSON.stringify(this.buildError(request.id, 'runtime_busy', rejection)))
      return
    }

    const abortRegistration = ws ? this.registerWebSocketDispatchAbort(ws) : null

    // Why: older pairings may lack scope metadata, so stamp the authenticated scope onto status.get.
    const auditStartedAt = Date.now()
    let auditRecorded = false
    const replyForRequest = (response: string): void => {
      const scopedResponse =
        request.method === 'status.get' ? injectDeviceScope(response, device.scope) : response
      if (!auditRecorded) {
        auditRecorded = true
        let result: 'allowed' | 'denied' | 'error' = 'error'
        let errorCode: string | undefined
        let errorMessage: string | undefined
        try {
          const parsed = JSON.parse(scopedResponse) as RpcResponse
          if (parsed.ok === true) {
            result = 'allowed'
          } else {
            errorCode = typeof parsed.error.code === 'string' ? parsed.error.code : undefined
            if (parsed.error.code === 'forbidden' || parsed.error.code === 'unauthorized') {
              result = 'denied'
            } else if (typeof parsed.error.message === 'string') {
              // Why: a bare error code cannot tell a refusal from a host-side failure.
              errorMessage = parsed.error.message.slice(0, 200)
            }
          }
        } catch {
          // Keep the error result when a handler emitted a malformed frame.
        }
        // Project walls and sidebars hydrate repeatedly for both access modes. Keep the audit useful
        // by retaining denied/error requests and explicit writes while leaving routine successful
        // reads out.
        if (!(isRoutineReadRuntimeMethod(request.method) && result === 'allowed')) {
          this.getRuntimeAccessAudit().record({
            at: Date.now(),
            deviceId: device.deviceId,
            deviceName: device.name,
            accessMode,
            ...(device.teamBinding
              ? {
                  teamGroupId: device.teamBinding.teamGroupId,
                  memberId: device.teamBinding.memberId
                }
              : undefined),
            method: request.method,
            result,
            requestId: request.id,
            durationMs: Date.now() - auditStartedAt,
            ...(errorCode ? { errorCode } : {}),
            ...(errorMessage ? { errorMessage } : {})
          })
        }
      }
      reply(scopedResponse)
    }

    const connectionId = ws ? this.mobileSocketWiring?.getConnectionId(ws) : undefined
    const pairingProvider = this.mobileRelayPairingProvider
    const pairingContext =
      pairingProvider && authenticatedSocket
        ? {
            getEndpoints: (params: PairingGetEndpointsParams) =>
              pairingProvider.getEndpoints(
                {
                  deviceId: authenticatedSocket.device.deviceId,
                  connectionId: authenticatedSocket.connectionId,
                  transport: authenticatedSocket.transport
                },
                params
              ),
            provisionRelay: (params: PairingProvisionRelayParams) =>
              pairingProvider.provisionRelay(
                {
                  deviceId: authenticatedSocket.device.deviceId,
                  connectionId: authenticatedSocket.connectionId,
                  transport: authenticatedSocket.transport
                },
                params
              )
          }
        : undefined
    try {
      await this.dispatcher.dispatchStreaming(request, replyForRequest, {
        // Why: the validated credential preserves existing federation ownership without trusting request fields.
        authenticatedCallerFingerprint: fingerprintAuthenticatedPairingCredential(token),
        connectionId,
        clientId: token,
        pairedDeviceId: device.deviceId,
        pairedDeviceName: device.name,
        accessMode,
        teamBinding: device.teamBinding,
        // Why: gates the mobile-only payload diet so full-screen web/desktop clients aren't truncated.
        clientKind: device.scope,
        clientCapabilities: authenticatedSocket?.clientCapabilities,
        updateClientCapabilities:
          authenticatedSocket && device.scope === 'mobile'
            ? (clientCapabilities) => {
                authenticatedSocket.clientCapabilities = clientCapabilities
              }
            : undefined,
        pairing: pairingContext,
        signal: abortRegistration?.signal,
        sendBinary,
        registerBinaryStreamHandler: (streamId, handler) =>
          this.registerBinaryStreamHandler(
            connectionId,
            streamId,
            teamReadTerminalStreamHandler(accessMode, handler)
          ),
        registerBinaryMessageHandler: (handler) =>
          this.registerBinaryMessageHandler(connectionId, handler)
      })
    } finally {
      abortRegistration?.dispose()
      this.releaseLongPoll(longPoll, device.deviceId)
    }
  }
}
