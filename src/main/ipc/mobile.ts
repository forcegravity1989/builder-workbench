import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import type {
  RuntimeAccessAuditEntry,
  RuntimeAccessAuditResult,
  RuntimeAccessGrant
} from '../../shared/runtime-access-grants'
import type { MobilePairingConnectionMode } from '../../shared/mobile-pairing-connection-mode'
import { classifyRemotePairingHostname } from '../../shared/remote-pairing-address'
import type { RuntimePairingReach } from '../../shared/runtime-pairing-reach'
import { effectiveRuntimeAccessMode, type DeviceEntry } from '../runtime/device-registry'
import type { RuntimeAccessMode, RuntimeTeamBinding } from '../../shared/runtime-session-contracts'
import { NETWORK_EXPOSURE_FAILED_GUIDANCE } from '../runtime/network-exposure-guidance'
import {
  getDefaultPairingAddress,
  getPairingNetworkInterfaces,
  type DefaultRouteInterfaceLookup,
  type NetworkInterface
} from '../runtime/pairing-network-interfaces'
import { resolveAdvertisedPairingHostname } from '../runtime/pairing-endpoint'
import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import type { MobileRelayStatusDetail } from '../../shared/mobile-relay-status'
import { encodeMobilePairingQr, type MobilePairingQrResult } from '../runtime/mobile-pairing-qr'
import { getWindowsDefaultRouteInterfaceNames } from '../runtime/windows-default-route-interfaces'
import {
  getWebSocketPort,
  inspectWindowsMobileFirewall,
  repairWindowsMobileFirewall,
  type WindowsMobileFirewallEnvironment
} from '../runtime/windows-mobile-firewall'

// Why: only an explicit "This computer only" pick skips the one-way widen, and only when the address it
// advertises really is loopback — a mismatch (a LAN address under a this-computer reach) would otherwise
// mint a link with no listener behind it. Every other reach, including a loopback-looking Custom address
// that fronts an SSH tunnel or reverse proxy, still opts in.
function servesThisComputerOnly(reach: RuntimePairingReach | undefined, address: string): boolean {
  if (reach !== 'this-computer') {
    return false
  }
  const hostname = resolveAdvertisedPairingHostname(address)
  return hostname !== null && classifyRemotePairingHostname(hostname) === 'loopback'
}

function toRuntimeAccessGrant(device: DeviceEntry): RuntimeAccessGrant {
  return {
    deviceId: device.deviceId,
    name: device.name,
    ...(device.avatar ? { avatar: device.avatar } : {}),
    createdAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt > 0 ? device.lastSeenAt : null,
    ...(effectiveRuntimeAccessMode(device) === 'team-read'
      ? { accessMode: 'team-read' as const }
      : { accessMode: 'full' as const }),
    ...(device.teamBinding ? { teamBinding: device.teamBinding } : {}),
    ...(device.parentDeviceId !== undefined ? { parentDeviceId: device.parentDeviceId } : {}),
    ...(device.pairingEndpoint && device.parentDeviceId === undefined ? { canCopyLink: true } : {})
  }
}

// Why: the mobile IPC handlers provide the renderer with QR code pairing data,
// device management, and WebSocket readiness status. They depend on the
// OrcaRuntimeRpcServer because it owns the device registry and TLS state.

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
      interfaces: await getPairingNetworkInterfaces(getDefaultRouteInterfaceNames)
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
      // Why: allow the caller to specify which network interface address to
      // embed in the QR code. This supports overlay networks (Tailscale,
      // ZeroTier) where the default LAN IP isn't reachable from the phone.
      const ip = args?.address ?? (await getDefaultPairingAddress(getDefaultRouteInterfaceNames))
      // Why: the local address is optional under Relay — the QR carries the relay invite, so a host
      // with nothing auto-advertisable (only container bridges, or no interface at all) still pairs.
      // The offer's endpoint then falls back to loopback, which is the phone's own device: the direct
      // candidate loses the race by construction. LAN-only has no relay to fall back on, so it fails closed.
      if (!ip && args?.connectionMode === 'local-only') {
        return {
          available: false as const,
          reason: 'invalid_advertised_endpoint',
          guidance:
            'No reachable network address is available for pairing. Connect to Wi‑Fi or Tailscale, or pick an address manually.'
        }
      }

      // Why: coalesce repeated QR regenerations onto a single never-scanned
      // pending token so the copy-button flow doesn't accumulate orphaned
      // device credentials forever. The token graduates to a real entry when
      // a phone actually connects (lastSeenAt > 0). When the caller passes
      // `rotate: true` (explicit "Regenerate" intent because the prior token
      // may have been exposed), we discard any pending token and mint a fresh
      // one so the new QR carries a different credential.
      const offer = await rpcServer.createMobilePairingOffer({
        address: ip,
        connectionMode: args?.connectionMode,
        rotate: args?.rotate,
        name: `Mobile ${new Date().toLocaleDateString()}`
      })
      if (!offer.available) {
        // Why: surface Relay mint failures (and other pairing unavailability)
        // so the UI can refuse a silent LAN QR under the Relay label.
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
        // Why: with nothing advertised the offer's endpoint is the loopback fallback, which points at
        // whichever device scans the QR — never this host. Report no endpoint so the UI omits it
        // instead of printing an address the phone can't reach.
        endpoint: ip ? offer.endpoint : null,
        deviceId: offer.deviceId,
        connectionMode: offer.connectionMode
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
      const ip = args?.address ?? (await getDefaultPairingAddress(getDefaultRouteInterfaceNames))
      if (!ip) {
        return { available: false as const }
      }

      // Why: STA-2370 — generating a runtime pairing offer is the user's explicit opt-in to remote
      // reach, so widen the loopback listener before advertising its LAN endpoint. If the widen fails the
      // listener stays on loopback, so report unavailable rather than advertise a dead LAN endpoint.
      // "This computer only" is the opposite opt-in: the loopback listener already serves it, and the widen
      // never narrows back, so that pick alone must not expose the runtime off-host.
      const thisComputerOnly = servesThisComputerOnly(args?.reach, ip)
      if (!thisComputerOnly) {
        try {
          await rpcServer.ensureNetworkExposure()
        } catch (error) {
          console.error(
            '[mobile] Network exposure failed while creating a runtime pairing offer:',
            error
          )
          // Why: STA-2370 — carry the specific reason/guidance to the renderer (mirrors the mobile-QR path) so
          // a widen failure is distinguishable from a missing address, not collapsed into a bare unavailable.
          return {
            available: false as const,
            reason: 'network_exposure_failed' as const,
            guidance: NETWORK_EXPOSURE_FAILED_GUIDANCE
          }
        }
      }

      // Why: web/desktop runtime clients need full runtime access, not the
      // mobile allowlist used by phone QR pairing.
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
      const offer = rpcServer.createPairingOffer({
        address: ip,
        rotate: args?.rotate,
        name: displayName,
        ...(displayAvatar ? { avatar: displayAvatar } : undefined),
        scope: 'runtime',
        // Why: a grant that only ever pointed at loopback must not make the next launch bind every
        // interface when its local client reconnects (that would restore the exposure one restart later).
        reach: thisComputerOnly ? 'this-computer' : 'network',
        ...(args?.accessMode ? { accessMode: args.accessMode } : undefined),
        ...(args?.teamBinding ? { teamBinding: args.teamBinding } : undefined)
      })
      if (!offer.available) {
        return { available: false as const }
      }

      return {
        available: true as const,
        pairingUrl: offer.pairingUrl,
        webClientUrl: offer.webClientUrl,
        endpoint: offer.endpoint,
        deviceId: offer.deviceId
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
    // Why: devices with lastSeenAt === 0 were created during QR generation
    // but never actually scanned/connected. Showing them as "paired" is
    // misleading, so we filter them out.
    return {
      devices: registry
        .listDevices()
        .filter((d) => d.scope === 'mobile' && d.lastSeenAt > 0)
        .map((d) => ({
          deviceId: d.deviceId,
          name: d.name,
          pairedAt: d.pairedAt,
          lastSeenAt: d.lastSeenAt
        }))
    }
  })

  ipcMain.handle('mobile:listRuntimeAccessGrants', () => {
    const registry = rpcServer.getDeviceRegistry()
    if (!registry) {
      return { grants: [] }
    }
    // Why: generated web/runtime links are bearer credentials even before a
    // client first connects, so pending runtime grants must stay revocable.
    const socketWiring = rpcServer.getMobileSocketWiring?.()
    return {
      grants: registry
        .listDevices()
        .filter((d) => d.scope === 'runtime')
        .sort((a, b) => b.pairedAt - a.pairedAt)
        .map((device) => ({
          ...toRuntimeAccessGrant(device),
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
          ? rpcServer.getMobileSocketWiring?.()?.isDeviceConnected(device.deviceId) === true &&
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

  ipcMain.handle('mobile:isWebSocketReady', () => {
    return {
      ready: rpcServer.getWebSocketEndpoint() !== null,
      endpoint: rpcServer.getWebSocketEndpoint()
    }
  })

  ipcMain.handle('mobile:getWindowsFirewallStatus', (_event, args?: { address?: string }) => {
    const port = getWebSocketPort(rpcServer.getWebSocketEndpoint())
    return inspectWindowsMobileFirewall(port, args?.address, firewallEnvironment)
  })

  ipcMain.handle('mobile:repairWindowsFirewall', (event: IpcMainInvokeEvent) => {
    if (!isWindowRenderer(event)) {
      return { ok: false as const, reason: 'unsupported' as const }
    }
    // Why: elevated inputs come from the running runtime, never the renderer.
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
