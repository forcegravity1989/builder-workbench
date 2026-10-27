import type * as RuntimeClientTarget from '@/runtime/runtime-client-target'
import { beforeEach, expect, it, vi } from 'vitest'
const { state, rpc, local } = vi.hoisted(() => ({
  state: {
    repos: [{ id: 'repo-1', path: '/repo', executionHostId: 'runtime:owner' }],
    settings: { activeRuntimeEnvironmentId: 'other' }
  },
  rpc: vi.fn(),
  local: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/runtime/runtime-rpc-client', async () => ({
  ...(await vi.importActual<typeof RuntimeClientTarget>('@/runtime/runtime-client-target')),
  callRuntimeRpc: rpc
}))
import { codehubApi } from './codehub-api'
beforeEach(() => {
  vi.stubGlobal('window', {
    api: { codehub: { setIssueState: local, listTasks: local, viewer: local } }
  })
  rpc.mockReset()
  local.mockReset()
  state.repos[0].executionHostId = 'runtime:owner'
})
it('uses the repo owner instead of the newly focused runtime for reads and writes', async () => {
  const args = { repoId: 'repo-1', repoPath: '/repo', iid: 12, state: 'closed' as const }
  await codehubApi.setIssueState(args)
  expect(rpc).toHaveBeenCalledWith(
    { kind: 'environment', environmentId: 'owner' },
    'codehub.setIssueState',
    args,
    { timeoutMs: 60_000 }
  )
  expect(local).not.toHaveBeenCalled()
  await codehubApi.viewer({ repoId: args.repoId, repoPath: args.repoPath })
  expect(rpc).toHaveBeenLastCalledWith(
    { kind: 'environment', environmentId: 'owner' },
    'codehub.viewer',
    { repoId: args.repoId, repoPath: args.repoPath },
    { timeoutMs: 60_000 }
  )
})
it('retains the local preload path for a local repo while another runtime has focus', async () => {
  state.repos[0].executionHostId = 'local'
  const args = {
    repoId: 'repo-1',
    repoPath: '/repo',
    kind: 'issue' as const,
    state: 'opened' as const
  }
  await codehubApi.listTasks(args)
  expect(local).toHaveBeenCalledWith(args)
  expect(rpc).not.toHaveBeenCalled()
  await codehubApi.viewer({ repoId: args.repoId, repoPath: args.repoPath })
  expect(local).toHaveBeenLastCalledWith({ repoId: args.repoId, repoPath: args.repoPath })
})
