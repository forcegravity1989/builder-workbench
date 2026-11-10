import {
  remoteRuntimeConnectOptions,
  remoteRuntimeConnectFailureMessage
} from './remote-runtime-connect-bound'
import { randomUUID } from 'node:crypto'
import { throwIfSignalAborted, abortSignalReason } from './abort-signal-reason'
import WebSocket from 'ws'
import type { PairedRuntimeConnection } from './remote-runtime/pairing/paired-runtime-connection'
import {
  deriveSharedKey,
  encryptBytes,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from './e2ee-crypto'
import {
  formatRemoteRuntimeCloseMessage,
  ignoreSettledRemoteRuntimeSocketError
} from './remote-runtime-client-handshake'
import { RemoteRuntimeClientError } from './remote-runtime-client-error'
import {
  isRemoteRuntimeBinaryFrameWithinLimit,
  REMOTE_RUNTIME_MAX_WEBSOCKET_FRAME_BYTES,
  serializeRemoteRuntimePayload,
  serializeRemoteRuntimeRpcRequest
} from './remote-runtime-memory-limits'
import { remoteRuntimeClientCapabilities } from './remote-runtime-client-capabilities'
import { RemoteRuntimeSubscriptionFrameRouter } from './remote-runtime-subscription-frame-router'
import { RemoteRuntimeSubscriptionOutbound } from './remote-runtime-subscription-outbound'
import { RemoteRuntimeSubscriptionRequestChannel } from './remote-runtime-subscription-request-channel'
import {
  startRemoteRuntimeSocketLiveness,
  type RemoteRuntimeSocketLivenessMonitor
} from './remote-runtime-socket-liveness'

import type {
  RemoteRuntimeSubscriptionOptions,
  RemoteRuntimeTransportSubscription,
  RemoteRuntimeTransportSubscriptionCallbacks
} from './remote-runtime-subscription-contract'

export async function subscribeRemoteRuntimeTransport<TResult>(
  pairing: PairedRuntimeConnection,
  method: string,
  params: unknown,
  timeoutMs: number,
  callbacks: RemoteRuntimeTransportSubscriptionCallbacks<TResult>,
  options?: RemoteRuntimeSubscriptionOptions
): Promise<RemoteRuntimeTransportSubscription> {
  throwIfSignalAborted(options?.signal)
  const requestId = randomUUID()
  const serializedRequest = serializeRemoteRuntimeRpcRequest({
    requestId,
    deviceToken: pairing.credential.deviceToken,
    method,
    params
  })
  const serializedAuth = serializeRemoteRuntimePayload({
    type: 'e2ee_auth',
    deviceToken: pairing.credential.deviceToken,
    clientCapabilities: remoteRuntimeClientCapabilities(options?.clientCapabilities)
  })
  return await new Promise((resolve, reject) => {
    const keyPair = generateKeyPair()
    const serverPublicKey = publicKeyFromBase64(pairing.hostPublicKeyB64)
    const sharedKey = deriveSharedKey(keyPair.secretKey, serverPublicKey)
    let settled = false
    let closing = false
    let terminalFailure = false
    let ws: WebSocket | null = null
    let liveness: RemoteRuntimeSocketLivenessMonitor | null = null
    const outbound = new RemoteRuntimeSubscriptionOutbound({
      memoryBudget: options?.outboundMemoryBudget,
      binaryQueue: options?.outboundQueue,
      fail: (error) => fail(error)
    })
    const requestChannel = new RemoteRuntimeSubscriptionRequestChannel({
      pairing,
      sharedKey,
      resolveWritableSocket: () =>
        frameRouter.state === 'ready' && ws && ws.readyState === WebSocket.OPEN ? ws : null,
      enqueue: (socket, frame) => outbound.enqueueRequest(socket, frame),
      fail: (error) => fail(error)
    })
    const frameRouter = new RemoteRuntimeSubscriptionFrameRouter({
      sharedKey,
      serializedAuth,
      serializedRequest,
      requestId,
      send: (frame) => ws?.send(frame),
      fail: (error) => fail(error),
      onAuthenticated: () => succeed(),
      resolvePendingRequest: (response) => requestChannel.resolveResponse(response),
      callbacks
    })

    const cleanupSocketListeners = (): WebSocket | null => {
      options?.signal?.removeEventListener('abort', onAbort)
      liveness?.stop()
      liveness = null
      outbound.releaseQueues()
      const socket = ws
      if (!socket) {
        if (!outbound.hasRetainedCloseSource) {
          outbound.releaseSocketMemory()
        }
        return null
      }
      socket.off('open', onOpen)
      socket.off('error', onError)
      socket.off('close', onClose)
      socket.off('message', onMessage)
      socket.off('pong', onPong)
      socket.off('ping', onLivenessSignal)
      ws = null
      outbound.retainSocketMemoryUntilClose(socket)
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.on('error', ignoreSettledRemoteRuntimeSocketError)
      }
      return socket
    }

    const closeSocketAfterCleanup = (): void => {
      const socket = cleanupSocketListeners()
      try {
        socket?.close()
      } catch {
        // ignore best-effort close
      }
    }

    const timeout = setTimeout(() => {
      fail(
        new RemoteRuntimeClientError(
          'runtime_timeout',
          'Timed out waiting for the remote Orca runtime subscription to start.'
        )
      )
    }, timeoutMs)

    const close = (): void => {
      if (closing) {
        return
      }
      options?.signal?.removeEventListener('abort', onAbort)
      closing = true
      requestChannel.rejectAll(
        new RemoteRuntimeClientError(
          'remote_runtime_unavailable',
          'Remote runtime subscription closed before its request completed.'
        )
      )
      outbound.releaseQueues()
      if (ws) {
        outbound.retainSocketMemoryUntilClose(ws)
      } else if (!outbound.hasRetainedCloseSource) {
        outbound.releaseSocketMemory()
      }
      try {
        ws?.close()
      } catch {
        // ignore best-effort close
      }
    }

    const sendBinary = (bytes: Uint8Array<ArrayBufferLike>): boolean => {
      if (
        !isRemoteRuntimeBinaryFrameWithinLimit(bytes) ||
        frameRouter.state !== 'ready' ||
        !ws ||
        ws.readyState !== WebSocket.OPEN
      ) {
        return false
      }
      return outbound.enqueueBinary(ws, Buffer.from(encryptBytes(bytes, sharedKey)))
    }

    const succeed = (): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve({ requestId, close, sendBinary, sendRequest: requestChannel.send })
    }

    const fail = (error: RemoteRuntimeClientError): void => {
      if (terminalFailure || closing) {
        return
      }
      terminalFailure = true
      requestChannel.rejectAll(error)
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        closeSocketAfterCleanup()
        reject(error)
        return
      }
      callbacks.onError(error)
      closeSocketAfterCleanup()
      callbacks.onClose?.()
    }

    const onAbort = (): void => {
      if (settled) {
        close()
      } else {
        settled = true
        clearTimeout(timeout)
        closeSocketAfterCleanup()
        reject(abortSignalReason(options!.signal!))
      }
    }
    options?.signal?.addEventListener('abort', onAbort, { once: true })
    if (options?.signal?.aborted) {
      onAbort()
      return
    }
    try {
      ws = new WebSocket(
        pairing.endpoint,
        remoteRuntimeConnectOptions({
          maxPayload: REMOTE_RUNTIME_MAX_WEBSOCKET_FRAME_BYTES,
          ...(options?.perMessageDeflate === false ? { perMessageDeflate: false } : {})
        })
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fail(new RemoteRuntimeClientError('invalid_argument', `Invalid remote endpoint: ${message}`))
      return
    }

    function onOpen(): void {
      ws?.send(
        JSON.stringify({ type: 'e2ee_hello', publicKeyB64: publicKeyToBase64(keyPair.publicKey) })
      )
    }

    function onError(error: Error): void {
      fail(
        new RemoteRuntimeClientError(
          'remote_runtime_unavailable',
          remoteRuntimeConnectFailureMessage(error, pairing.endpoint)
        )
      )
    }

    function onClose(code: number, reason: Buffer): void {
      clearTimeout(timeout)
      cleanupSocketListeners()
      requestChannel.rejectAll(
        new RemoteRuntimeClientError(
          'remote_runtime_unavailable',
          formatRemoteRuntimeCloseMessage(code, reason)
        )
      )
      if (!settled) {
        settled = true
        reject(
          new RemoteRuntimeClientError(
            'remote_runtime_unavailable',
            formatRemoteRuntimeCloseMessage(code, reason)
          )
        )
        return
      }
      callbacks.onClose?.()
    }

    function onMessage(data: WebSocket.RawData, isBinary: boolean): void {
      if (closing) {
        return
      }
      liveness?.noteActivity()
      frameRouter.handleFrame(data, isBinary)
    }

    function onPong(): void {
      liveness?.notePong()
    }

    function onLivenessSignal(): void {
      liveness?.noteActivity()
    }

    ws.once('open', onOpen)
    ws.once('error', onError)
    ws.on('close', onClose)
    ws.on('message', onMessage)
    ws.on('pong', onPong)
    ws.on('ping', onLivenessSignal)

    const monitoredWs = ws
    liveness = startRemoteRuntimeSocketLiveness({
      ping: () => {
        if (monitoredWs.readyState !== WebSocket.OPEN) {
          return false
        }
        monitoredWs.ping()
        return true
      },
      onDead: () => {
        fail(
          new RemoteRuntimeClientError(
            'remote_runtime_unavailable',
            'Remote Orca runtime stopped responding; the stream connection was reset.'
          )
        )
        try {
          monitoredWs.terminate()
        } catch {
          // Best-effort terminate; the subscription is already settled.
        }
      },
      options
    })
  })
}
