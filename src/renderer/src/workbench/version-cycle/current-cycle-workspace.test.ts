import { beforeEach, expect, it, vi } from 'vitest'
import type { CycleScope } from './ports'
const mocks = vi.hoisted(() => ({
  state: {
    activeView: 'terminal',
    activeWorktreeId: 'wt',
    activeWorkspaceExecutionHostId: undefined as string | undefined,
    getKnownWorktreeById: () => ({ hostId: 'local' })
  }
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('./native-cycle-workspace', () => ({
  cycleScopeForWorktree: (tree: { hostId: string }, workflow: string) => ({
    projectId: 'p',
    repoId: 'r',
    hostId: tree.hostId,
    workflow
  }),
  cycleScopeKey: (scope: CycleScope) =>
    JSON.stringify([scope.projectId, scope.repoId, scope.hostId, scope.workflow])
}))
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'
const scope: CycleScope = { projectId: 'p', repoId: 'r', hostId: 'local', workflow: 'plan' }
beforeEach(() => {
  mocks.state.activeView = 'terminal'
  mocks.state.activeWorktreeId = 'wt'
  mocks.state.activeWorkspaceExecutionHostId = undefined
  mocks.state.getKnownWorktreeById = () => ({ hostId: 'local' })
})
it('accepts the fixed tree while it is the active terminal workspace', () => {
  expect(() => assertCurrentCycleWorkspace(scope, 'wt')).not.toThrow()
})
it('rejects after a switch to another view or worktree', () => {
  mocks.state.activeView = 'activity'
  expect(() => assertCurrentCycleWorkspace(scope, 'wt')).toThrow('工作区已切换')
  mocks.state.activeView = 'terminal'
  mocks.state.activeWorktreeId = 'other'
  expect(() => assertCurrentCycleWorkspace(scope, 'wt')).toThrow('工作区已切换')
})
it('rejects a same-id workspace owned by a different host', () => {
  mocks.state.getKnownWorktreeById = () => ({ hostId: 'ssh:other' })
  expect(() => assertCurrentCycleWorkspace(scope, 'wt')).toThrow('工作区已切换')
})
