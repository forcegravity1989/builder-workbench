import type * as RuntimeClientTarget from '@/runtime/runtime-client-target'
import type { Repo } from '../../../shared/repo-types'
import { beforeEach, expect, it, vi } from 'vitest'
const { state, rpc, local } = vi.hoisted(() => ({
  state: {
    repos: [
      {
        id: 'repo-1',
        path: '/repo',
        executionHostId: 'runtime:owner' as NonNullable<Repo['executionHostId']>
      }
    ],
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
import { findCodeHubTaskRepo } from './codehub-task-repo'
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
  state.repos.push({ ...state.repos[0], executionHostId: 'runtime:other' })
  const rows = state.repos.map((row) => ({
    ...row,
    displayName: 'benchmark',
    badgeColor: '#737373',
    addedAt: 1
  }))
  expect(
    findCodeHubTaskRepo(rows, {
      repoId: args.repoId,
      repoPath: args.repoPath,
      executionHostId: 'runtime:owner'
    })
  ).toBe(rows[0])
  expect(
    findCodeHubTaskRepo(rows, {
      repoId: args.repoId,
      repoPath: args.repoPath,
      executionHostId: 'runtime:other'
    })
  ).toBe(rows[1])
  expect(findCodeHubTaskRepo(rows, { repoId: args.repoId, repoPath: args.repoPath })).toBeNull()
  expect(
    findCodeHubTaskRepo(rows, {
      repoId: args.repoId,
      repoPath: args.repoPath,
      executionHostId: 'runtime:removed'
    })
  ).toBeNull()
  await codehubApi.listTasks(
    { repoId: args.repoId, repoPath: args.repoPath, kind: 'issue', state: 'opened' },
    state.repos[0]
  )
  expect(rpc).toHaveBeenLastCalledWith(
    { kind: 'environment', environmentId: 'owner' },
    'codehub.listTasks',
    { repoId: args.repoId, repoPath: args.repoPath, kind: 'issue', state: 'opened' },
    { timeoutMs: 60_000 }
  )
  await codehubApi.setIssueState(args, rows[0])
  expect(rpc).toHaveBeenLastCalledWith(
    { kind: 'environment', environmentId: 'owner' },
    'codehub.setIssueState',
    args,
    { timeoutMs: 60000 }
  )
  state.repos.pop()
})
it('retains the local preload path for a local repo while another runtime has focus', async () => {
  state.repos[0].executionHostId = 'local'
  const args = {
    repoId: 'repo-1',
    repoPath: '/repo',
    kind: 'issue' as const,
    state: 'opened' as const
  }
  state.repos.push({ ...state.repos[0], executionHostId: 'runtime:other' })
  await codehubApi.listTasks(args, state.repos[0])
  expect(local).toHaveBeenCalledWith(args)
  expect(rpc).not.toHaveBeenCalled()
  state.repos.pop()
  await codehubApi.viewer({ repoId: args.repoId, repoPath: args.repoPath })
  expect(local).toHaveBeenLastCalledWith({ repoId: args.repoId, repoPath: args.repoPath })
})
