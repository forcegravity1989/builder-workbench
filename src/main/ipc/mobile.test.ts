import { beforeEach, describe, expect, it, vi } from 'vitest'

const handleMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: { handle: handleMock },
  shell: { openExternal: vi.fn() }
}))

import { registerMobileHandlers } from './mobile'

describe('shared host access', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  beforeEach(() => {
    handlers.clear()
    handleMock.mockReset()
    handleMock.mockImplementation((name: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(name, handler)
    })
  })

  it('records a revoked runtime link', () => {
    const record = vi.fn()
    registerMobileHandlers({
      getDeviceRegistry: () => ({
        getDevice: () => ({ deviceId: 'runtime-1', name: '安迪', scope: 'runtime' })
      }),
      getRuntimeAccessAudit: () => ({ record }),
      revokeRuntimeAccess: () => true
    } as never)
    expect(handlers.get('mobile:revokeRuntimeAccess')?.(null, { deviceId: 'runtime-1' })).toEqual({
      revoked: true
    })
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'runtime-1', method: 'access.revoke', result: 'allowed' })
    )
  })

  it('switches a connected team member between full access and read-only, and logs both', () => {
    const teamBinding = { teamGroupId: 'team-1', memberId: 'member-1' }
    const device = {
      deviceId: 'runtime-1',
      name: '安迪',
      scope: 'runtime',
      accessMode: 'team-read',
      parentDeviceId: 'team-link',
      teamBinding
    }
    const setAccessMode = vi.fn((_id: string, mode: string) => {
      device.accessMode = mode as 'team-read'
      return true
    })
    const record = vi.fn()
    let connected = true
    const rpcServer = {
      getDeviceRegistry: () => ({ getDevice: () => device, setAccessMode }),
      getMobileSocketWiring: () => ({ isDeviceConnected: () => connected }),
      getRuntimeAccessAudit: () => ({ record })
    }
    registerMobileHandlers(rpcServer as never)
    const setMode = handlers.get('mobile:setRuntimeAccessMode')!

    expect(setMode(null, { deviceId: 'runtime-1', accessMode: 'full' })).toEqual({
      accessMode: 'full'
    })
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'access.grant.full', accessMode: 'full' })
    )
    // Going back needs no connection and keeps the member's team record.
    connected = false
    expect(setMode(null, { deviceId: 'runtime-1', accessMode: 'team-read' })).toEqual({
      accessMode: 'team-read'
    })
    expect(setAccessMode).toHaveBeenLastCalledWith('runtime-1', 'team-read', teamBinding)
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'access.restore.readonly', accessMode: 'team-read' })
    )
    // Full access is refused for a member who is not connected, and nothing is logged for it.
    record.mockClear()
    expect(setMode(null, { deviceId: 'runtime-1', accessMode: 'full' })).toEqual({
      accessMode: 'team-read'
    })
    expect(record).not.toHaveBeenCalled()
  })
})
