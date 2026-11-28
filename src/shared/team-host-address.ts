import {
  isVirtualBridgeInterface,
  selectAutoAdvertisedPairingAddress,
  type PairingNetworkInterface
} from './remote-runtime/pairing/pairing-address-auto-selection'

/** Office LAN used by team members. 100.x Tailscale and 192.168/172.16 home nets are not this. */
export function isOfficeIPv4Address(address: string): boolean {
  const octets = address.split('.')
  if (octets.length !== 4) {
    return false
  }
  if (octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) {
    return false
  }
  return Number(octets[0]) === 10
}

/**
 * Address to publish in team settings. Prefer a non-bridge 10.x office NIC, then the
 * existing pairing advertiser (Tailscale, then the first other reachable address).
 */
export function selectTeamOfficeAddress(
  interfaces: readonly PairingNetworkInterface[]
): string | undefined {
  const office = interfaces.filter(
    (iface) =>
      isOfficeIPv4Address(iface.address) &&
      !isVirtualBridgeInterface(iface.name, iface.hasDefaultRoute)
  )
  return (
    office.find((iface) => iface.hasDefaultRoute)?.address ??
    office[0]?.address ??
    selectAutoAdvertisedPairingAddress(interfaces)
  )
}
