import { usesLegacyE2EE } from '../runtime/rpc/server/pairing/device-sighting'
import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import type {
  RuntimeAccessAuditEntry,
  RuntimeAccessAuditResult,
  RuntimeAccessGrant
} from '../../shared/remote-runtime/host-catalog/runtime-access-grants'
import type {
  RuntimeAccessMode,
  RuntimeTeamBinding
} from '../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type { MobilePairingConnectionMode } from '../../shared/remote-runtime/pairing/mobile-pairing-connection-mode'
import type { RuntimePairingReach } from '../../shared/remote-runtime/pairing/runtime-pairing-reach'
import {
  effectiveRuntimeAccessMode,
  isPairedMobileDevice,
  type DeviceEntry
} from '../runtime/rpc/server/pairing/device-entry'
import {
  requestMobilePairingOffer,
  requestRuntimePairingOffer
} from '../runtime/rpc/server/pairing/pairing-offer-requests'
import {
  getPairingNetworkInterfaces,
  type DefaultRouteInterfaceLookup,
  type NetworkInterface
} from '../runtime/rpc/server/pairing/network/pairing-network-interfaces'
import type { OrcaRuntimeRpcServer } from '../runtime/rpc/server/runtime-rpc'
import type { MobileRelayStatusDetail } from '../../shared/remote-runtime/relay/mobile-relay-status'
import {
  encodeMobilePairingQr,
  type MobilePairingQrResult
} from '../runtime/rpc/server/pairing/mobile-pairing-qr'
import { usesOlderPairingMethod } from '../runtime/rpc/server/pairing/pairing-ticket-exchange'
import {
  MOBILE_PAIRING_OFFER_TTL_MS,
  RUNTIME_PAIRING_OFFER_TTL_MS
} from '../runtime/rpc/server/pairing/pairing-offer-expiry'
import { getWindowsDefaultRouteInterfaceNames } from '../runtime/rpc/server/pairing/network/windows-default-route-interfaces'
import {
  getWebSocketPort,
  inspectWindowsMobileFirewall,
  repairWindowsMobileFirewall,
  type WindowsMobileFirewallEnvironment
} from '../runtime/rpc/server/pairing/network/windows-mobile-firewall'

function toRuntimeAccessGrant(
  device: DeviceEntry,
  devices: readonly DeviceEntry[]
): RuntimeAccessGrant {
  return {
    deviceId: device.deviceId,
    name: device.name,
    ...(device.avatar ? { avatar: device.avatar } : {}),
    createdAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt > 0 ? device.lastSeenAt : null,
    usesLegacyEncryption: usesLegacyE2EE(device),
    ...(usesOlderPairingMethod(device, devices) ? { olderPairingMethod: true as const } : {}),
    ...(effectiveRuntimeAccessMode(device) === 'team-read'
      ? { accessMode: 'team-read' as const }
      : { accessMode: 'full' as const }),
    ...(device.teamBinding ? { teamBinding: device.teamBinding } : {}),
    ...(device.parentDeviceId !== undefined ? { parentDeviceId: device.parentDeviceId } : {}),
    ...(device.pairingEndpoint && device.parentDeviceId === undefined ? { canCopyLink: true } : {})
  }
}

export type MobileHandlerDependencies = {
  firewallEnvironment?: WindowsMobileFirewallEnvironment
  openWindowsNetworkSettings?: () => Promise<void>
  getRelayStatus?: () => MobileRelayStatusDetail
  consumePendingUnpairedDeviceAuthFailure?: (webContentsId: number) => boolean
  encodePairingQr?: (pairingUrl: string) => Promise<MobilePairingQrResult>
  getDefaultRouteInterfaceNames?: DefaultRouteInterfaceLookup
  /** Labels a generated link with its owner when the caller did not name it. */
  resolveLinkOwnerIdentity?: () => Promise<{ name: string; avatar?: string } | null>
}

export function registerMobileHandlers(
  rpcServer: OrcaRuntimeRpcServer,
  dependencies: MobileHandlerDependencies = {}
): void {
  const firewallEnvironment = dependencies.firewallEnvironment ?? {
    platform: process.platform,
    isPackaged: app.isPackaged,
    executablePath: process.execPath,
    systemRoot: process.env.SystemRoot
  }
  const getDefaultRouteInterfaceNames =
    dependencies.getDefaultRouteInterfaceNames ?? getWindowsDefaultRouteInterfaceNames
  ipcMain.handle(
    'mobile:listNetworkInterfaces',
    async (): Promise<{ interfaces: NetworkInterface[] }> => ({
      interfaces: await getPairingNetworkInterfaces(
        rpcServer.getNetworkExposureBindHost(),
        getDefaultRouteInterfaceNames
      )
    })
  )

  ipcMain.handle(
    'mobile:getPairingQR',
    async (
      _event,
      args?: {
        address?: string
        connectionMode?: MobilePairingConnectionMode
        rotate?: boolean
      }
    ) => {
      const offer = await requestMobilePairingOffer(
        rpcServer,
        {
          address: args?.address,
          connectionMode: args?.connectionMode,
          rotate: args?.rotate,
          offerTtlMs: MOBILE_PAIRING_OFFER_TTL_MS
        },
        getDefaultRouteInterfaceNames
      )
      if (!offer.available) {
        // Preserve relay mint failures instead of silently presenting a LAN offer under the Relay label.
        return {
          available: false as const,
          reason: offer.reason,
          guidance: offer.guidance,
          ...(offer.relayFailure ? { relayFailure: offer.relayFailure } : {})
        }
      }

      const qr = await (dependencies.encodePairingQr ?? encodeMobilePairingQr)(offer.pairingUrl)

      return {
        available: true as const,
        qrDataUrl: qr.ok ? qr.qrDataUrl : null,
        qrSize: qr.ok ? qr.qrSize : null,
        ...(!qr.ok ? { qrError: qr.reason } : {}),
        pairingUrl: offer.pairingUrl,
        endpoint: offer.endpoint,
        deviceId: offer.deviceId,
        connectionMode: offer.connectionMode,
        expiresAt: offer.offerExpiresAt
      }
    }
  )

  ipcMain.handle(
    'mobile:getRuntimePairingUrl',
    async (
      _event,
      args?: {
        address?: string
        rotate?: boolean
        reach?: RuntimePairingReach
        accessMode?: RuntimeAccessMode
        teamBinding?: RuntimeTeamBinding
        name?: string
        avatar?: string
      }
    ) => {
      const callerName =
        typeof args?.name === 'string' && args.name.trim().length > 0 && args.name.length <= 256
          ? args.name.trim()
          : null
      const namedByCaller = callerName !== null
      // A link nobody named is labelled with its owner (the signed-in WeLink user), so every
      // entry point shows the same identity; the date label is only the fallback.
      let owner: { name: string; avatar?: string } | null = null
      if (!namedByCaller && dependencies.resolveLinkOwnerIdentity) {
        try {
          owner = await dependencies.resolveLinkOwnerIdentity()
        } catch {
          owner = null
        }
      }
      const ownerName = owner === null ? undefined : owner.name
      const displayName = callerName ?? ownerName ?? `Runtime ${new Date().toLocaleDateString()}`
      const callerAvatar =
        typeof args?.avatar === 'string' && args.avatar.length > 0 && args.avatar.length <= 4096
          ? args.avatar
          : undefined
      const ownerAvatar = namedByCaller || owner === null ? undefined : owner.avatar
      const displayAvatar = callerAvatar ?? ownerAvatar
      const offer = await requestRuntimePairingOffer(
        rpcServer,
        {
          address: args?.address,
          rotate: args?.rotate,
          reach: args?.reach,
          name: displayName,
          avatar: displayAvatar,
          accessMode: args?.accessMode,
          teamBinding: args?.teamBinding,
          offerTtlMs: args?.accessMode === 'team-read' ? undefined : RUNTIME_PAIRING_OFFER_TTL_MS
        },
        getDefaultRouteInterfaceNames
      )
      if (!offer.available) {
        // Preserve actionable widening failure guidance rather than generic unavailability.
        return offer.reason === 'network_exposure_failed'
          ? { available: false as const, reason: offer.reason, guidance: offer.guidance }
          : { available: false as const }
      }

      return {
        available: true as const,
        pairingUrl: offer.pairingUrl,
        webClientUrl: offer.webClientUrl,
        endpoint: offer.endpoint,
        deviceId: offer.deviceId,
        expiresAt: offer.offerExpiresAt
      }
    }
  )

  ipcMain.handle('mobile:getRuntimeAccessLinkUrl', (_event, args: { deviceId: string }) => ({
    pairingUrl:
      typeof args?.deviceId === 'string' ? rpcServer.getRuntimeAccessLinkUrl(args.deviceId) : null
  }))

  ipcMain.handle('mobile:restoreRuntimePairingUrl', (_event, reference: unknown) =>
    rpcServer.restoreRuntimePairingUrl(reference)
  )

  ipcMain.handle('mobile:listDevices', () => {
    const registry = rpcServer.getDeviceRegistry()
    if (!registry) {
      return { devices: [] }
    }
    const all = registry.listDevices()
    return {
      devices: all.filter(isPairedMobileDevice).map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        pairedAt: d.pairedAt,
        lastSeenAt: d.lastSeenAt,
        usesLegacyEncryption: usesLegacyE2EE(d),
        ...(usesOlderPairingMethod(d, all) ? { olderPairingMethod: true as const } : {})
      }))
    }
  })

  ipcMain.handle('mobile:listRuntimeAccessGrants', () => {
    const registry = rpcServer.getDeviceRegistry()
    if (!registry) {
      return { grants: [] }
    }
    const socketWiring = rpcServer.getMobileSocketWiring?.()
    // Runtime links are bearer credentials immediately, so unconnected grants must remain revocable.
    const all = registry.listDevices({ fresh: true })
    return {
      grants: all
        .filter((d) => d.scope === 'runtime')
        .sort((a, b) => b.pairedAt - a.pairedAt)
        .map((device) => ({
          ...toRuntimeAccessGrant(device, all),
          ...(socketWiring ? { connected: socketWiring.isDeviceConnected(device.deviceId) } : {})
        }))
    }
  })

  // Switches one member between read-only and full access. The change applies to their next request
  // and to terminals they already have open.
  ipcMain.handle(
    'mobile:setRuntimeAccessMode',
    (_event, args: { deviceId: string; accessMode: RuntimeAccessMode }) => {
      const registry = rpcServer.getDeviceRegistry()
      const device = registry?.getDevice(args?.deviceId)
      if (
        !registry ||
        !device ||
        device.scope !== 'runtime' ||
        (args.accessMode !== 'full' && args.accessMode !== 'team-read')
      ) {
        return { accessMode: null }
      }
      const current = effectiveRuntimeAccessMode(device)
      if (current === args.accessMode) {
        return { accessMode: current }
      }
      // Full access is only given to someone who is connected right now, so the host sees who it is
      // handing it to; going back to read-only needs a team record to return to.
      const changed =
        args.accessMode === 'full'
          ? device.parentDeviceId !== undefined &&
            rpcServer.getMobileSocketWiring?.()?.isDeviceConnected(device.deviceId) === true &&
            registry.setAccessMode(device.deviceId, 'full')
          : device.teamBinding !== undefined &&
            registry.setAccessMode(device.deviceId, 'team-read', device.teamBinding)
      if (!changed) {
        return { accessMode: current }
      }
      rpcServer.getRuntimeAccessAudit?.()?.record({
        at: Date.now(),
        deviceId: device.deviceId,
        deviceName: device.name,
        accessMode: args.accessMode,
        ...(device.teamBinding
          ? {
              teamGroupId: device.teamBinding.teamGroupId,
              memberId: device.teamBinding.memberId
            }
          : undefined),
        method: args.accessMode === 'full' ? 'access.grant.full' : 'access.restore.readonly',
        result: 'allowed'
      })
      return { accessMode: args.accessMode }
    }
  )

  ipcMain.handle(
    'mobile:listRuntimeAccessAudit',
    async (
      _event,
      args?: {
        action?: string
        result?: RuntimeAccessAuditResult
        since?: number
        search?: string
      }
    ): Promise<{ entries: RuntimeAccessAuditEntry[]; directory: string }> => {
      const audit = rpcServer.getRuntimeAccessAudit?.()
      if (!audit) {
        return { entries: [], directory: '' }
      }
      return {
        entries: await audit.list(args),
        directory: audit.getDirectory()
      }
    }
  )

  ipcMain.handle('mobile:clearRuntimeAccessAudit', async () => {
    const audit = rpcServer.getRuntimeAccessAudit?.()
    if (!audit) {
      return { cleared: false }
    }
    await audit.clear()
    return { cleared: true }
  })

  // Revoking a shared-host link is an authorization change the owner reviews in the access log.
  // The device is read before revoking and the entry is written only if the revoke took effect.
  const auditRevocation = (deviceId: string): ((revoked: boolean) => boolean) => {
    const device = rpcServer.getDeviceRegistry()?.getDevice(deviceId)
    return (revoked) => {
      if (revoked && device?.scope === 'runtime') {
        rpcServer.getRuntimeAccessAudit?.()?.record({
          at: Date.now(),
          deviceId: device.deviceId,
          deviceName: device.name,
          accessMode: effectiveRuntimeAccessMode(device),
          ...(device.teamBinding
            ? { teamGroupId: device.teamBinding.teamGroupId, memberId: device.teamBinding.memberId }
            : undefined),
          method: 'access.revoke',
          result: 'allowed'
        })
      }
      return revoked
    }
  }

  ipcMain.handle('mobile:revokeDevice', async (_event, args: { deviceId: string }) => {
    const registry = rpcServer.getDeviceRegistry()
    if (!registry) {
      return { revoked: false }
    }
    const audit = auditRevocation(args.deviceId)
    return { revoked: audit(await rpcServer.revokeMobileDevice(args.deviceId)) }
  })

  ipcMain.handle('mobile:revokeRuntimeAccess', (_event, args: { deviceId: string }) => {
    const registry = rpcServer.getDeviceRegistry()
    if (!registry) {
      return { revoked: false }
    }
    const audit = auditRevocation(args.deviceId)
    return { revoked: audit(rpcServer.revokeRuntimeAccess(args.deviceId)) }
  })

  ipcMain.handle('mobile:getWindowsFirewallStatus', (_event, args?: { address?: string }) => {
    const port = getWebSocketPort(rpcServer.getWebSocketEndpoint())
    return inspectWindowsMobileFirewall(port, args?.address, firewallEnvironment)
  })

  ipcMain.handle('mobile:repairWindowsFirewall', (event: IpcMainInvokeEvent) => {
    if (!isWindowRenderer(event)) {
      return { ok: false as const, reason: 'unsupported' as const }
    }
    // Firewall repair derives privileged inputs from runtime state, never renderer payloads.
    const port = getWebSocketPort(rpcServer.getWebSocketEndpoint())
    return repairWindowsMobileFirewall(port, firewallEnvironment)
  })

  ipcMain.handle('mobile:openWindowsNetworkSettings', async (event: IpcMainInvokeEvent) => {
    if (!isWindowRenderer(event) || firewallEnvironment.platform !== 'win32') {
      return false
    }
    const openSettings =
      dependencies.openWindowsNetworkSettings ??
      (() => shell.openExternal('ms-settings:network-status'))
    await openSettings()
    return true
  })

  ipcMain.handle(
    'mobile:getRelayStatus',
    (): MobileRelayStatusDetail => dependencies.getRelayStatus?.() ?? { status: 'offline' }
  )

  ipcMain.handle('mobile:consumePendingUnpairedDeviceAuthFailure', (event) => {
    if (!isWindowRenderer(event)) {
      return false
    }
    return dependencies.consumePendingUnpairedDeviceAuthFailure?.(event.sender.id) ?? false
  })
}

function isWindowRenderer(event: IpcMainInvokeEvent): boolean {
  return !event.sender.isDestroyed() && event.sender.getType() === 'window'
}
