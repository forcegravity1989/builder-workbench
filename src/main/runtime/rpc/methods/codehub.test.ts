import { expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { CODEHUB_METHODS } from './codehub'
import { MOBILE_RPC_METHOD_ALLOWLIST } from '../../runtime-rpc/runtime-rpc-mobile-method-allowlist'

it('routes paired/web CodeHub reads and writes through the native dispatcher', async () => {
  const codehub = {
    listTasks: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    viewer: vi
      .fn()
      .mockResolvedValue({ id: 42, username: 'owner', name: 'Owner', state: 'active' }),
    setIssueState: vi.fn().mockResolvedValue(undefined)
  }
  const runtime = { getRuntimeId: () => 'owner', codehub } as unknown as OrcaRuntimeService
  const dispatcher = new RpcDispatcher({ runtime, methods: CODEHUB_METHODS })
  const repo = { repoId: 'repo-1', repoPath: '/srv/project' }
  const list = { ...repo, kind: 'issue', state: 'opened', limit: 60, labels: ['bw:plan:v0.1'] }
  const state = { ...repo, iid: 12, state: 'closed', stateReason: 'completed' }
  for (const [method, params] of [
    ['listTasks', list],
    ['viewer', repo],
    ['setIssueState', state]
  ] as const) {
    const response = await dispatcher.dispatch({
      id: 'test',
      authToken: 'test',
      method: `codehub.${method}`,
      params
    })
    expect(response).toMatchObject({ ok: true })
    expect(codehub[method]).toHaveBeenCalledWith(params)
  }
  for (const method of CODEHUB_METHODS) {
    expect(MOBILE_RPC_METHOD_ALLOWLIST.has(method.name)).toBe(true)
  }
  const invalid = await dispatcher.dispatch({
    id: 'test',
    authToken: 'test',
    method: 'codehub.setIssueState',
    params: { ...state, iid: -1 }
  })
  expect(invalid).toMatchObject({ ok: false })
  expect(codehub.setIssueState).toHaveBeenCalledTimes(1)
})
