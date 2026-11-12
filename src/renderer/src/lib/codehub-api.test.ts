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
import { codehubApi, createCodeHubApi, localCodehubApi } from './codehub-api'
beforeEach(() => {
  vi.stubGlobal('window', {
    api: { codehub: { setIssueState: local, listTasks: local, viewer: local } }
  })
  rpc.mockReset()
  local.mockReset()
  state.repos[0].executionHostId = 'runtime:owner'
})
it('routes to the repo owner by default and stays local for task reads or local repos', async () => {
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
  const bound = createCodeHubApi({
    kind: 'task-source',
    provider: 'codehub',
    projectId: 'project',
    hostId: 'runtime:review-source',
    repoId: 'native-repo'
  })
  state.settings.activeRuntimeEnvironmentId = 'different-host'
  await bound.setIssueState(args)
  expect(rpc).toHaveBeenLastCalledWith(
    { kind: 'environment', environmentId: 'review-source' },
    'codehub.setIssueState',
    { ...args, repoId: 'native-repo' },
    { timeoutMs: 60_000 }
  )

  // 本机仓库不因另一个 runtime 获得焦点而改走远端。
  rpc.mockClear()
  state.repos[0].executionHostId = 'local'
  const listArgs = {
    repoId: 'repo-1',
    repoPath: '/repo',
    kind: 'issue' as const,
    state: 'opened' as const
  }
  await codehubApi.listTasks(listArgs)
  expect(local).toHaveBeenCalledWith(listArgs)
  expect(rpc).not.toHaveBeenCalled()
  await codehubApi.viewer({ repoId: listArgs.repoId, repoPath: listArgs.repoPath })
  expect(local).toHaveBeenLastCalledWith({
    repoId: listArgs.repoId,
    repoPath: listArgs.repoPath
  })

  // 任务读取固定本机：即使项目登记行属于 runtime，也走本机 preload。
  state.repos[0].executionHostId = 'runtime:owner'
  await localCodehubApi.viewer({ repoId: 'repo-1', repoPath: '/repo' })
  expect(local).toHaveBeenLastCalledWith({ repoId: 'repo-1', repoPath: '/repo' })
  expect(rpc).not.toHaveBeenCalled()
})
