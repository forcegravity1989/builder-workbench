import type WebSocket from 'ws'
import type { PairedRuntimeConnection } from './remote-runtime/pairing/paired-runtime-connection'
import type { RemoteRuntimeClientError } from './remote-runtime-client-error'
import { remoteRuntimeClientCapabilities } from './remote-runtime-client-capabilities'
import { remoteRuntimeUnavailableError } from './remote-runtime-request-frames'
import { openSharedControlSocket } from './remote-runtime-shared-control-open'
import * as sharedControlReady from './remote-runtime-shared-control-ready'
import * as sharedControlProtocol from './remote-runtime-shared-control-protocol'
import { SharedControlReconnectScheduler } from './remote-runtime-shared-control-reconnect'
import { requestSharedControl } from './remote-runtime-shared-control-requests'
import { SharedControlRetiredRequestIds } from './remote-runtime-shared-control-retired-request-ids'
import { SharedControlReadinessTimer } from './remote-runtime-shared-control-stability'
import * as sharedControlState from './remote-runtime-shared-control-state'
import { closeSharedControlSocket } from './remote-runtime-shared-control-socket-close'
import { startSharedControlSubscription } from './remote-runtime-shared-control-subscription-start'
import { SharedControlSocketGeneration } from './remote-runtime-shared-control-socket-generation'
import { refreshRemoteRuntimeSharedControl } from './remote-runtime-shared-control-refresh'
import { SharedControlDiagnosticsTracker } from './remote-runtime-shared-control-diagnostics'
import { ensureSharedControlReady } from './remote-runtime-shared-control-ready-wait'
import { handleRuntimeControlTextFrame } from './remote-runtime-shared-control-connection-frame'
import {
  closeSharedControlSubscription,
  replayRuntimeControlSubscriptions,
  sendSharedControlRequest,
  sendSharedControlSubscription
} from './remote-runtime-shared-control-connection-actions'
import type * as SharedControlTypes from './remote-runtime-shared-control-types'
type PendingRequest = SharedControlTypes.SharedControlPendingRequest<unknown>
type LogicalSubscription = SharedControlTypes.SharedControlLogicalSubscription<unknown>

export class RemoteRuntimeSharedControlConnection {
  private state: SharedControlTypes.SharedControlConnectionState = 'closed'
  private ws: WebSocket | null = null
  private sharedKey: Uint8Array | null = null
  private socketCleanup: (() => void) | null = null
  private readonly reconnect = new SharedControlReconnectScheduler()
  private readonly readiness: SharedControlReadinessTimer
  private intentionallyClosed = false
  private readonly diagnostics: SharedControlDiagnosticsTracker
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly subscriptions = new Map<string, LogicalSubscription>()
  private readonly retiredRequestIds = new SharedControlRetiredRequestIds()
  private readonly readyWaiters: SharedControlTypes.SharedControlReadyWaiter[] = []
  private everReady = false
  readonly socketGeneration = new SharedControlSocketGeneration()

  isReady(): boolean {
    return this.state === 'ready'
  }

  constructor(
    private readonly pairing: PairedRuntimeConnection,
    private readonly options: SharedControlTypes.RemoteRuntimeSharedControlConnectionOptions = {}
  ) {
    this.diagnostics = new SharedControlDiagnosticsTracker(options, () => ({
      state: this.state,
      reconnecting: this.reconnect.isScheduled,
      pendingRequestCount: this.pendingRequests.size,
      subscriptionCount: this.subscriptions.size,
      reconnectAttempt: this.reconnect.attemptCount
    }))
    this.readiness = new SharedControlReadinessTimer(options, {
      getState: () => this.state,
      getSocket: () => this.ws,
      resetAttempt: () => this.reconnect.resetAttempt(),
      retire: (error, generation) => this.handleSocketClosed(error, generation)
    })
  }
  request<TResult>(
    method: string,
    params: unknown,
    timeoutMs: number,
    envelope?: Parameters<typeof requestSharedControl>[0]['envelope'],
    signal?: AbortSignal,
    beforeSend?: () => void
  ): ReturnType<typeof requestSharedControl<TResult>> {
    return requestSharedControl<TResult>({
      beforeSend,
      pendingRequests: this.pendingRequests,
      deviceToken: this.pairing.credential.deviceToken,
      method,
      params,
      timeoutMs,
      envelope,
      ensureReady: () => this.ensureReadyWithTimeout(timeoutMs, signal),
      send: (requestId) =>
        sendSharedControlRequest({
          pendingRequests: this.pendingRequests,
          requestId,
          state: this.state,
          ws: this.ws,
          sharedKey: this.sharedKey
        }),
      retireRequestId: (requestId) => this.retiredRequestIds.retire(requestId),
      signal
    })
  }
  async subscribe<TResult>(
    method: string,
    params: unknown,
    timeoutMs: number,
    callbacks: SharedControlTypes.SharedControlSubscriptionCallbacks<TResult>,
    signal?: AbortSignal
  ): Promise<SharedControlTypes.RemoteRuntimeSharedSubscription> {
    return startSharedControlSubscription({
      subscriptions: this.subscriptions,
      deviceToken: this.pairing.credential.deviceToken,
      method,
      params,
      callbacks,
      signal,
      ensureReady: () => this.ensureReadyWithTimeout(timeoutMs, signal),
      sendSubscription: (subscription) =>
        sendSharedControlSubscription({
          subscriptions: this.subscriptions,
          subscription,
          deviceToken: this.pairing.credential.deviceToken,
          send: (payload) => this.sendEncrypted(payload)
        }),
      closeSubscription: (requestId) => this.closeSubscription(requestId)
    })
  }
  close(error?: Error): void {
    this.intentionallyClosed = true
    this.socketGeneration.invalidate()
    this.reconnect.clear()
    for (const subscription of Array.from(this.subscriptions.values())) {
      this.closeSubscription(subscription.requestId)
    }
    this.closeSocket(error)
    this.publishDiagnostics()
  }
  readonly retryNow = (): boolean => this.reconnect.retryNow()
  pauseStandingRetry(): void {
    if (this.subscriptions.size === 0) {
      this.reconnect.clear()
      this.publishDiagnostics()
    }
  }

  private publishDiagnostics(): void {
    this.diagnostics.publish()
  }
  getDiagnostics(): SharedControlTypes.RemoteRuntimeSharedConnectionDiagnostics {
    return this.diagnostics.get()
  }
  reconnectNow(): void {
    refreshRemoteRuntimeSharedControl({
      intentionallyClosed: this.intentionallyClosed,
      ready: sharedControlReady.isSharedControlReady({
        state: this.state,
        ws: this.ws,
        sharedKey: this.sharedKey
      }),
      refresh: () => {
        this.closeSocket(
          remoteRuntimeUnavailableError('Refreshing remote runtime control transport.'),
          true
        )
        this.open()
      }
    })
  }
  private ensureReadyWithTimeout(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    return ensureSharedControlReady({
      state: this.state,
      ws: this.ws,
      sharedKey: this.sharedKey,
      readyWaiters: this.readyWaiters,
      timeoutMs,
      signal,
      open: () => sharedControlReady.openIfSocketClosed(this.ws, () => this.open())
    })
  }

  private open(): void {
    if (this.intentionallyClosed) {
      sharedControlState.rejectSharedControlReadyWaiters(
        this.readyWaiters,
        remoteRuntimeUnavailableError()
      )
      return
    }
    this.reconnect.clear()
    const socketGeneration = this.socketGeneration.begin()
    const opened = openSharedControlSocket(this.pairing, {
      getCurrentSocket: () => this.ws,
      onOpened: () => this.readiness.armReadyDeadline(socketGeneration),
      onActivity: this.options.onAnswered,
      onClose: (close, error) => {
        if (this.socketGeneration.isCurrent(socketGeneration)) {
          this.diagnostics.markClose(close)
        }
        this.handleSocketClosed(error, socketGeneration)
      },
      onError: (error) => this.handleSocketClosed(error, socketGeneration),
      onTextFrame: (frame) => this.handleTextFrame(frame, socketGeneration),
      liveness: {
        options: this.options.liveness,
        onDead: (error) => this.handleSocketClosed(error, socketGeneration)
      }
    })
    if (!opened.ok) {
      this.handleSocketClosed(opened.error, socketGeneration)
      return
    }
    this.ws = opened.socket.ws
    this.sharedKey = opened.socket.sharedKey
    this.socketCleanup = opened.socket.cleanup
    this.state = 'awaiting_ready'
    this.publishDiagnostics()
  }

  private handleTextFrame(frame: string, socketGeneration: number): void {
    handleRuntimeControlTextFrame({
      frame,
      socketGeneration,
      isCurrent: (generation) => this.socketGeneration.isCurrent(generation),
      getState: () => this.state,
      getSharedKey: () => this.sharedKey,
      environmentId: this.options.environmentId,
      deviceToken: this.pairing.credential.deviceToken,
      clientCapabilities: remoteRuntimeClientCapabilities(this.options.clientCapabilities),
      pendingRequests: this.pendingRequests,
      subscriptions: this.subscriptions,
      retiredRequestIds: this.retiredRequestIds,
      readyWaiters: this.readyWaiters,
      setState: (state) => {
        this.state = state
      },
      handleSocketClosed: (error) => this.handleSocketClosed(error, socketGeneration),
      sendEncrypted: (payload) => this.sendEncrypted(payload),
      markReady: () => {
        this.diagnostics.markReady()
        // Why cleared here: these describe the attempt that just succeeded's predecessor.
        // Left set, a recovered host reads "Connected" next to a stale failure forever.
        this.publishDiagnostics()
        this.readiness.scheduleStableReset()
        this.options.onReady?.()
      },
      replaySubscriptions: () => this.replaySubscriptions(),
      publishDiagnostics: () => this.publishDiagnostics()
    })
  }

  private replaySubscriptions(): void {
    this.everReady = replayRuntimeControlSubscriptions({
      subscriptions: this.subscriptions,
      deviceToken: this.pairing.credential.deviceToken,
      send: (payload) => this.sendEncrypted(payload),
      tagReplayedResponses: this.everReady
    })
  }

  private closeSubscription(requestId: string): void {
    closeSharedControlSubscription({
      subscriptions: this.subscriptions,
      retiredRequestIds: this.retiredRequestIds,
      requestId,
      deviceToken: this.pairing.credential.deviceToken,
      send: (payload) => this.sendEncrypted(payload)
    })
  }

  private sendEncrypted(payload: unknown): boolean {
    return sharedControlProtocol.sendSharedControlEncrypted({
      state: this.state,
      ws: this.ws,
      sharedKey: this.sharedKey,
      payload
    })
  }

  private handleSocketClosed(error: RemoteRuntimeClientError, socketGeneration: number): void {
    if (
      !this.socketGeneration.acceptClose({
        generation: socketGeneration,
        error,
        everReady: this.everReady,
        subscriptions: this.subscriptions,
        closeSocket: () => this.closeSocket(error)
      })
    ) {
      return
    }
    this.diagnostics.markError(error.message)
    this.reconnect.scheduleAfterSocketClose({
      intentionallyClosed: this.intentionallyClosed,
      manuallyDisconnected: this.options.isManuallyDisconnected?.() ?? false,
      capabilityPaused: this.options.isCapabilityPaused?.() ?? false,
      subscriptionCount: this.subscriptions.size,
      open: () => this.open()
    })
    this.publishDiagnostics()
  }

  private closeSocket(error?: Error, preserveReadyWaitersAndPendingRequests = false): void {
    closeSharedControlSocket({
      environmentId: this.options.environmentId,
      state: this.state,
      pendingRequests: this.pendingRequests,
      subscriptions: this.subscriptions,
      readyWaiters: this.readyWaiters,
      lastClose: this.getDiagnostics().lastClose,
      socketCleanup: this.socketCleanup,
      ws: this.ws,
      error,
      preserveReadyWaitersAndPendingRequests,
      clearReadyStableTimer: () => this.readiness.clear()
    })
    this.ws = this.sharedKey = null
    this.socketCleanup = null
    this.state = 'closed'
    this.publishDiagnostics()
  }
}
