import type { PreloadApi } from '../../../../../preload/api-types'
import { noopUnsubscribe } from '../web-storage'

export function createWebMobileApi(): Partial<PreloadApi> {
  return {
    mobile: {
      listNetworkInterfaces: () => Promise.resolve({ interfaces: [] }),
      getPairingQR: () => Promise.resolve({ available: false }),
      getWindowsFirewallStatus: () => Promise.resolve({ supported: false }),
      repairWindowsFirewall: () => Promise.resolve({ ok: false, reason: 'unsupported' }),
      openWindowsNetworkSettings: () => Promise.resolve(false),
      getRuntimePairingUrl: () => Promise.resolve({ available: false }),
      restoreRuntimePairingUrl: () => Promise.resolve(null),
      getRuntimeAccessLinkUrl: () => Promise.resolve({ pairingUrl: null }),
      listDevices: () => Promise.resolve({ devices: [] }),
      revokeDevice: () => Promise.resolve({ revoked: false }),
      listRuntimeAccessGrants: () => Promise.resolve({ grants: [] }),
      setRuntimeAccessMode: () => Promise.resolve({ accessMode: null }),
      clearRuntimeAccessAudit: () => Promise.resolve({ cleared: false }),
      listRuntimeAccessAudit: () => Promise.resolve({ entries: [], directory: '' }),
      revokeRuntimeAccess: () => Promise.resolve({ revoked: false }),
      getRelayStatus: () => Promise.resolve({ status: 'offline' as const }),
      onRelayStatusChanged: () => noopUnsubscribe,
      onDevicesChanged: () => noopUnsubscribe,
      consumePendingUnpairedDeviceAuthFailure: () => Promise.resolve(false),
      onUnpairedDeviceAuthFailure: () => noopUnsubscribe
    }
  }
}
