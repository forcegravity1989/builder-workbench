import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as NodeOs from 'node:os'

const { defaultRouteInterfaceNamesMock, handleMock, networkInterfacesMock } = vi.hoisted(() => ({
  defaultRouteInterfaceNamesMock: vi.fn(),
  handleMock: vi.fn(),
  networkInterfacesMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: { handle: handleMock },
  shell: { openExternal: vi.fn() }
}))

vi.mock('qrcode', () => ({
  default: {
    create: vi.fn().mockReturnValue({ modules: { size: 21 } }),
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr')
  }
}))

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeOs>()),
  networkInterfaces: networkInterfacesMock
}))

vi.mock('../runtime/windows-default-route-interfaces', () => ({
  getWindowsDefaultRouteInterfaceNames: defaultRouteInterfaceNamesMock
}))

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerMobileHandlers } from './mobile'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { WebSocketTransport } from '../runtime/rpc/ws-transport'

describe('mobile runtime pairing bind host', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  const wsTransportOf = (server: OrcaRuntimeRpcServer): WebSocketTransport | undefined =>
    (server['activeTransports'] as unknown[]).find(
      (transport): transport is WebSocketTransport => transport instanceof WebSocketTransport
    )

  beforeEach(() => {
    handlers.clear()
    handleMock.mockReset()
    networkInterfacesMock.mockReset()
    networkInterfacesMock.mockReturnValue({})
    defaultRouteInterfaceNamesMock.mockReset().mockResolvedValue(new Set())
    handleMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
  })

  const startServer = async (userDataPath: string): Promise<OrcaRuntimeRpcServer> => {
    const server = new OrcaRuntimeRpcServer({
      runtime: new OrcaRuntimeService(),
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })
    await server.start()
    return server
  }

  it('inspects and repairs the current packaged Windows websocket port', async () => {
    const runPowerShell = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          ruleAllowed: false,
          privateFirewallEnabled: true,
          networkCategory: 'Private'
        })
      )
      .mockResolvedValueOnce('{"launched":true,"exitCode":0}')
    const rpcServer = { getWebSocketEndpoint: () => 'ws://0.0.0.0:6768' }
    registerMobileHandlers(rpcServer as never, {
      firewallEnvironment: {
        platform: 'win32',
        isPackaged: true,
        executablePath: 'C:\\Program Files\\Orca\\Orca.exe',
        runPowerShell
      }
    })

    await expect(
      handlers.get('mobile:getWindowsFirewallStatus')?.(null, { address: '192.168.0.108' })
    ).resolves.toMatchObject({ supported: true, port: 6768, ruleAllowed: false })
    await expect(
      handlers.get('mobile:repairWindowsFirewall')?.({
        sender: { isDestroyed: () => false, getType: () => 'window' }
      })
    ).resolves.toEqual({ ok: true })
  })

  it('rejects firewall mutation from a non-window renderer', async () => {
    const runPowerShell = vi.fn()
    const rpcServer = { getWebSocketEndpoint: () => 'ws://0.0.0.0:6768' }
    registerMobileHandlers(rpcServer as never, {
      firewallEnvironment: {
        platform: 'win32',
        isPackaged: true,
        executablePath: 'C:\\Program Files\\Orca\\Orca.exe',
        runPowerShell
      }
    })

    expect(
      handlers.get('mobile:repairWindowsFirewall')?.({
        sender: { isDestroyed: () => false, getType: () => 'webview' }
      })
    ).toEqual({ ok: false, reason: 'unsupported' })
    expect(runPowerShell).not.toHaveBeenCalled()
  })

  it('keeps a real listener on loopback for a local link and widens it only for an off-host one', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-mobile-ipc-'))
    const server = await startServer(userDataPath)

    try {
      registerMobileHandlers(server)
      expect(wsTransportOf(server)?.resolvedHost).toBe('127.0.0.1')

      await expect(
        handlers.get('mobile:getRuntimePairingUrl')?.(null, {
          address: '127.0.0.1',
          rotate: true,
          reach: 'this-computer'
        })
      ).resolves.toMatchObject({ available: true })
      expect(wsTransportOf(server)?.resolvedHost).toBe('127.0.0.1')

      await expect(
        handlers.get('mobile:getRuntimePairingUrl')?.(null, {
          address: '100.64.1.20',
          rotate: true,
          reach: 'network'
        })
      ).resolves.toMatchObject({ available: true })
      expect(wsTransportOf(server)?.resolvedHost).toBe('0.0.0.0')
    } finally {
      await server.stop()
    }
  })

  it('still binds loopback on the next launch after a local link has been used', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-mobile-ipc-'))
    const server = await startServer(userDataPath)
    let deviceId: string
    try {
      registerMobileHandlers(server)
      const offer = (await handlers.get('mobile:getRuntimePairingUrl')?.(null, {
        address: '127.0.0.1',
        rotate: true,
        reach: 'this-computer'
      })) as { available: true; deviceId: string }
      expect(offer.available).toBe(true)
      deviceId = offer.deviceId
      server.getDeviceRegistry()?.updateLastSeen(deviceId)
    } finally {
      await server.stop()
    }

    const relaunched = await startServer(userDataPath)
    try {
      expect(
        relaunched
          .getDeviceRegistry()
          ?.listDevices()
          .some((device) => device.deviceId === deviceId && device.lastSeenAt > 0)
      ).toBe(true)
      expect(wsTransportOf(relaunched)?.resolvedHost).toBe('127.0.0.1')
    } finally {
      await relaunched.stop()
    }
  })

  it('binds all interfaces on the next launch after a network link has been used', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-mobile-ipc-'))
    const server = await startServer(userDataPath)
    try {
      registerMobileHandlers(server)
      const offer = (await handlers.get('mobile:getRuntimePairingUrl')?.(null, {
        address: '100.64.1.20',
        rotate: true,
        reach: 'network'
      })) as { available: true; deviceId: string }
      expect(offer.available).toBe(true)
      server.getDeviceRegistry()?.updateLastSeen(offer.deviceId)
    } finally {
      await server.stop()
    }

    const relaunched = await startServer(userDataPath)
    try {
      expect(wsTransportOf(relaunched)?.resolvedHost).toBe('0.0.0.0')
    } finally {
      await relaunched.stop()
    }
  })
})
