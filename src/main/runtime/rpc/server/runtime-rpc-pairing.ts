import type { RuntimeDeviceGrant } from '../callers/rpc-method-permission'
import {
  RuntimePairingLinkReferenceSchema,
  type RuntimePairingLink
} from '../../../../shared/remote-runtime/host-catalog/runtime-access-grants'
import type { DeviceRegistry } from './pairing/device-registry'
import type {
  DeviceScope,
  RuntimeAccessMode,
  RuntimeTeamBinding
} from '../../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import { effectiveRuntimeAccessMode, type TokenDeviceEntry } from './pairing/device-entry'
import type { E2EEKeypair } from './pairing/e2ee-keypair'
import type { MobileSocketWiring } from '../mobile/mobile-socket-wiring'
import type {
  RelayDeviceBinding,
  RelayRevokeOutbox
} from '../../mobile-cloud-relay/pairing/relay-revoke-outbox'
import type { PushUnregisterOutbox } from '../../push/push-unregister-outbox'
import { encodePairingOffer } from '../../../../shared/remote-runtime/pairing/pairing'
import { PAIRING_OFFER_VERSION } from '../../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { RuntimePairingReach } from '../../../../shared/remote-runtime/pairing/runtime-pairing-reach'
import { resolveAdvertisedPairingEndpoint } from './pairing/network/pairing-endpoint'
import { RuntimeRpcNetworkExposure } from './runtime-rpc-network-exposure'
import { MobileDesktopRelay } from '../../mobile-desktop-relay/mobile-desktop-relay'
import type { MobileDesktopRelayHosts } from '../../mobile-desktop-relay/mobile-desktop-relay-hosts'
import { MobileRelayHostCatalog } from '../../mobile-desktop-relay/mobile-relay-host-catalog'
import { OnDemandServerWorktreeRows } from '../../mobile-desktop-relay/on-demand-server-worktree-rows'
import { getHostDisplayLabelOverrides } from '../../../../shared/execution-host/host-setting-overrides'
import { DELEGATED_PHONE_NAME_MAX_CHARS } from '../../../../shared/remote-runtime/pairing/delegated-mobile-device-contract'
import { allocateTerminalSubscriptionStreamId } from '../methods/terminal/terminal-subscription-stream-id'
import { isStructuredNativeChatDefaultFor } from '../methods/structured-sessions/structured-agent-session-policy'
import {
  createWebClientUrl,
  DEVICE_REGISTRY_UNAVAILABLE_GUIDANCE,
  E2EE_KEY_UNAVAILABLE_GUIDANCE,
  pairingUnavailable,
  type MobileRelayPairingProvider,
  type PairingOfferUnavailable
} from './runtime-rpc-pairing-types'
import {
  pendingVmCheckouts,
  publishPendingVmCheckoutRepoChanges
} from '../../../ephemeral-vm/pending-vm-checkouts'

export class RuntimeRpcPairing extends RuntimeRpcNetworkExposure {
  getDeviceRegistry(): DeviceRegistry | null {
    return this.deviceRegistry
  }

  getE2EEPublicKey(): string | null {
    return this.e2eeKeypair?.publicKeyB64 ?? null
  }

  getE2EEKeypair(): E2EEKeypair | null {
    return this.e2eeKeypair
  }

  getMobileSocketWiring(): MobileSocketWiring | null {
    return this.mobileSocketWiring
  }

  getRelayRevokeOutbox(): RelayRevokeOutbox {
    return this.relayRevokeOutbox
  }

  getPushUnregisterOutbox(): PushUnregisterOutbox {
    return this.pushUnregisterOutbox
  }

  setMobileRelayBinding(deviceId: string, binding: RelayDeviceBinding): boolean {
    const current = this.deviceRegistry?.getDevice(deviceId)
    if (
      current?.scope !== 'mobile' ||
      this.deviceRegistry?.getMobilePairingConnectionMode(deviceId) === 'local-only'
    ) {
      return false
    }
    if (
      current.relayBinding &&
      (current.relayBinding.relayHostId !== binding.relayHostId ||
        current.relayBinding.ownerIdentityKey !== binding.ownerIdentityKey)
    ) {
      // Switching account/host must durably revoke the old cloud credential family even while that account is offline.
      if (!this.queueRelayDeviceRevoke(current.relayBinding)) {
        return false
      }
    }
    const updated = this.deviceRegistry?.setRelayBinding(deviceId, binding) ?? false
    if (updated) {
      this.mobileRelayPairingProvider?.onDemandStateChanged?.()
    }
    return updated
  }

  // Why: only the desktop shell can surface UI; headless serve leaves this unset.
  setOnUnpairedDeviceAuthFailure(callback: (() => void) | null): void {
    this.onUnpairedDeviceAuthFailure = callback
  }

  // Registry instances are replaced on restart, so the listener lives here and is rebound per instance.
  setOnPairedDevicesChanged(callback: (() => void) | null): void {
    this.onPairedDevicesChanged = callback
  }

  setMobileRelayPairingProvider(provider: MobileRelayPairingProvider | null): void {
    this.mobileRelayPairingProvider = provider
  }

  setMobileRelayPairingProviderInstaller(install: (() => Promise<unknown>) | null): void {
    this.mobileRelayPairingProviderInstaller = install
  }

  setMobileDesktopRelayHosts(hosts: MobileDesktopRelayHosts | null): void {
    this.mobileDesktopRelay?.dispose()
    this.mobileDesktopRelay = hosts
      ? new MobileDesktopRelay({
          hosts,
          listPhones: () => this.listRelayedPhones(),
          // Share local stream allocator so relayed ids cannot collide on phone sockets.
          allocateStreamId: allocateTerminalSubscriptionStreamId,
          nativeChatDefault: (agent) => isStructuredNativeChatDefaultFor(this.runtime, agent),
          sourceControlAiSettings: () => this.runtime.requireStore().getSettings(),
          prepareBrowserHost: async (host) => {
            if (this.runtime.getStatus().capabilities?.includes('browser.screencast.v1')) {
              const placement = await hosts.prepareBrowserHost?.(
                host,
                this.runtime.requireStore().getSettings().browserClientHostedRemoteEnabled !== false
              )
              return placement?.kind === 'client' ? placement.browserHostClientId : null
            }
            return null
          }
        })
      : null
    const { pairedServerRows } = this.runtime
    this.detachPairedServerRows?.()
    this.detachPairedServerRows = hosts && pairedServerRows ? pairedServerRows.attach(hosts) : null
    this.mobileRelayHostCatalog = hosts
      ? new MobileRelayHostCatalog({
          hosts,
          serverRows: pairedServerRows ?? new OnDemandServerWorktreeRows(hosts),
          hostLabelOverrides: () =>
            getHostDisplayLabelOverrides(this.runtime.requireStore().getSettings()),
          getWorkspaceSession: (hostId) => this.runtime.getWorkspaceSessionForHost(hostId),
          recipeEnvironmentsFor: (hostId) =>
            this.runtime.describeRecipeWorkspaceEnvironments(hostId),
          pendingVmCheckouts: () => pendingVmCheckouts.current()
        })
      : null
    this.detachRelayHostsChanges?.()
    const detachListChanges =
      this.mobileRelayHostCatalog?.publishListChanges({
        onClientEvent: (listener) =>
          this.runtime.onClientEvent(listener, { consumesTerminalSideEffects: false }),
        changed: () => this.runtime.notifyRelayHostsChanged()
      }) ?? null
    // Phones filter pending VM checkouts when they read; a change makes them read again.
    const detachPendingVmChanges = this.mobileRelayHostCatalog
      ? publishPendingVmCheckoutRepoChanges(pendingVmCheckouts, (repoId) =>
          this.runtime.notifyWorktreesChangedForRemoteClients(repoId)
        )
      : null
    this.detachRelayHostsChanges =
      detachListChanges || detachPendingVmChanges
        ? () => {
            detachListChanges?.()
            detachPendingVmChanges?.()
          }
        : null
    this.runtime.setPairedWorkspaceContextSource(this.mobileRelayHostCatalog)
  }

  private listRelayedPhones(): { phoneKey: string; name: string }[] {
    const computerName = this.runtime.readMachineName()
    return (this.deviceRegistry?.listDevices() ?? [])
      .filter(
        // Phones delegated by another desktop remain that desktop's relay responsibility.
        (device) =>
          device.scope === 'mobile' && device.lastSeenAt > 0 && device.parentDeviceId === undefined
      )
      .map((device) => ({
        phoneKey: device.deviceId,
        name: `${device.name} via ${computerName}`.slice(0, DELEGATED_PHONE_NAME_MAX_CHARS)
      }))
  }

  getWebSocketEndpoint(): string | null {
    const ws = this.transports.find((t) => t.kind === 'websocket')
    return ws?.endpoint ?? null
  }

  restoreRuntimePairingUrl(reference: unknown): RuntimePairingLink | null {
    const parsed = RuntimePairingLinkReferenceSchema.safeParse(reference)
    if (!parsed.success) {
      return null
    }
    if (!this.deviceRegistry || !this.e2eeKeypair) {
      throw new Error('Runtime pairing identity is not ready.')
    }
    const saved = parsed.data
    const device = this.deviceRegistry?.getDevice(saved.deviceId)
    const publicKeyB64 = this.getE2EEPublicKey()
    if (device?.scope !== 'runtime' || !device.token || publicKeyB64 !== saved.publicKeyB64) {
      return null
    }
    const resolved = resolveAdvertisedPairingEndpoint('ws://127.0.0.1', saved.endpoint)
    if (!resolved.ok || resolved.endpoint !== saved.endpoint) {
      return null
    }
    // Restore the issued endpoint verbatim; recall must not mint a grant or claim connectivity.
    const pairingUrl = encodePairingOffer({
      v: PAIRING_OFFER_VERSION,
      endpoint: saved.endpoint,
      deviceToken: device.token,
      publicKeyB64,
      pairedDeviceId: device.deviceId,
      scope: 'runtime',
      ...(effectiveRuntimeAccessMode(device) === 'team-read'
        ? {
            accessMode: 'team-read' as const,
            ...(device.teamBinding ? { teamBinding: device.teamBinding } : {})
          }
        : {})
    })
    return {
      pairingUrl,
      endpoint: saved.endpoint,
      deviceId: device.deviceId,
      webClientUrl:
        this.webClientRoot && saved.webClientAvailable
          ? createWebClientUrl(saved.endpoint, pairingUrl)
          : null
    }
  }

  /** The pairing link of a shared link record, for copying it again; null when it was not recorded. */
  getRuntimeAccessLinkUrl(deviceId: string): string | null {
    const device = this.deviceRegistry?.getDevice(deviceId)
    const publicKeyB64 = this.getE2EEPublicKey()
    if (
      device?.scope !== 'runtime' ||
      device.parentDeviceId !== undefined ||
      !device.token ||
      !device.pairingEndpoint ||
      !publicKeyB64
    ) {
      return null
    }
    return encodePairingOffer({
      v: PAIRING_OFFER_VERSION,
      endpoint: device.pairingEndpoint,
      deviceToken: device.token,
      publicKeyB64,
      pairedDeviceId: device.deviceId,
      scope: 'runtime',
      ...(effectiveRuntimeAccessMode(device) === 'team-read'
        ? {
            accessMode: 'team-read' as const,
            ...(device.teamBinding ? { teamBinding: device.teamBinding } : {})
          }
        : {})
    })
  }

  createPairingOffer(args: {
    address?: string | null
    name?: string
    avatar?: string
    accessMode?: RuntimeAccessMode
    teamBinding?: RuntimeTeamBinding
    rotate?: boolean
    scope?: DeviceScope
    // Persist local-only policy on grants so reconnect cannot expose every interface; other callers default to network reach (STA-2370).
    reach?: RuntimePairingReach
    // Grant administrative permissions only at pairing, never as later device upgrades.
    grants?: readonly RuntimeDeviceGrant[]
    // Desktop UI only; absent keeps headless offers valid until scanned.
    offerTtlMs?: number
    // The paired client whose terminal asked; revoking it revokes the offer and whoever paired with it.
    createdByDeviceId?: string
  }):
    | PairingOfferUnavailable
    | {
        available: true
        pairingUrl: string
        endpoint: string
        deviceId: string
        webClientUrl: string | null
        offerExpiresAt: number | null
      } {
    if (this.pairingInitializationFailure) {
      return this.pairingInitializationFailure
    }
    const rawEndpoint = this.getWebSocketEndpoint()
    if (!rawEndpoint) {
      return pairingUnavailable(
        'websocket_unavailable',
        'WebSocket pairing is unavailable. Inspect preceding runtime errors and choose an unused --port if the listener failed.'
      )
    }
    if (!this.deviceRegistry) {
      return pairingUnavailable('device_registry_unavailable', DEVICE_REGISTRY_UNAVAILABLE_GUIDANCE)
    }
    const publicKeyB64 = this.getE2EEPublicKey()
    if (!publicKeyB64) {
      return pairingUnavailable('e2ee_key_unavailable', E2EE_KEY_UNAVAILABLE_GUIDANCE)
    }

    const advertised = resolveAdvertisedPairingEndpoint(rawEndpoint, args.address)
    if (!advertised.ok) {
      return pairingUnavailable(advertised.reason, advertised.guidance)
    }
    const endpoint = advertised.endpoint
    const deviceName = args.name ?? `CLI ${new Date().toLocaleDateString()}`
    const scope = args.scope ?? 'runtime'
    let device: TokenDeviceEntry
    try {
      const reach = args.reach ?? 'network'
      const grants = args.grants ?? []
      const options = {
        offerTtlMs: args.offerTtlMs,
        createdByDeviceId: args.createdByDeviceId,
        ...(scope === 'runtime'
          ? { avatar: args.avatar, accessMode: args.accessMode, teamBinding: args.teamBinding }
          : {})
      }
      device = args.rotate
        ? this.deviceRegistry.rotatePendingDevice(deviceName, scope, reach, grants, options)
        : this.deviceRegistry.getOrCreatePendingDevice(deviceName, scope, reach, grants, options)
    } catch (error) {
      console.error('[runtime] Failed to persist pairing credential:', error)
      return pairingUnavailable('device_registry_unavailable', DEVICE_REGISTRY_UNAVAILABLE_GUIDANCE)
    }
    if (scope === 'runtime') {
      this.deviceRegistry.setPairingEndpoint(device.deviceId, endpoint)
    }
    const hostDescriptor = this.hostDescriptor
    const pairingUrl = encodePairingOffer({
      v: PAIRING_OFFER_VERSION,
      endpoint,
      deviceToken: device.token,
      publicKeyB64,
      pairedDeviceId: device.deviceId,
      scope,
      ...(effectiveRuntimeAccessMode(device) === 'team-read'
        ? {
            accessMode: 'team-read' as const,
            ...(device.teamBinding ? { teamBinding: device.teamBinding } : {})
          }
        : {}),
      // Runtime clients pin host identity; mobile does not need these extra QR bytes.
      ...(hostDescriptor && scope === 'runtime' ? { hostDescriptor } : {})
    })
    return {
      available: true,
      pairingUrl,
      endpoint,
      deviceId: device.deviceId,
      webClientUrl:
        this.webClientRoot && scope === 'runtime' ? createWebClientUrl(endpoint, pairingUrl) : null,
      offerExpiresAt: device.offerExpiresAt ?? null
    }
  }

  protected queueOrRetainRelayDeviceRevoke(deviceId: string, binding: RelayDeviceBinding): void {
    if (this.queueRelayDeviceRevoke(binding)) {
      return
    }
    try {
      this.deviceRegistry?.setRelayBinding(deviceId, binding)
    } catch (error) {
      console.error('[runtime] Failed to retain an unrevoked Relay binding:', error)
    }
  }
}
