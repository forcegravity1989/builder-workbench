import { describe, expect, it } from 'vitest'
import { isOfficeIPv4Address, selectTeamOfficeAddress } from './team-host-address'

describe('team office address', () => {
  it('prefers the office adapter and falls back to Orca selection without one', () => {
    expect(isOfficeIPv4Address('10.138.18.233')).toBe(true)
    expect(isOfficeIPv4Address('100.64.1.8')).toBe(false)
    expect(isOfficeIPv4Address('192.168.1.5')).toBe(false)
    expect(isOfficeIPv4Address('169.254.239.57')).toBe(false)

    expect(
      selectTeamOfficeAddress([
        { name: 'Tailscale', address: '100.64.1.8' },
        { name: 'WLAN', address: '192.168.1.5' },
        { name: 'vEthernet (Default Switch)', address: '10.0.0.2' },
        { name: '以太网', address: '10.138.18.233' },
        { name: '以太网 2', address: '10.138.209.38', hasDefaultRoute: true }
      ])
    ).toBe('10.138.209.38')
    expect(
      selectTeamOfficeAddress([
        { name: 'Tailscale', address: '100.64.1.8' },
        { name: 'WLAN', address: '192.168.1.5' }
      ])
    ).toBe('100.64.1.8')
  })
})
