import { expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'

const fixture = vi.hoisted(() => ({ worktrees: [] as Worktree[] }))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ repos: [], allWorktrees: () => fixture.worktrees }) }
}))
import { resolveWorkbenchPromptAssets } from './cycle-prompt'

it('injects bundled discovery assets and the selected owner into an ordinary project', async () => {
  fixture.worktrees = [
    {
      id: 'tree',
      repoId: 'repo',
      projectId: 'project',
      hostId: 'ssh:host',
      runtimeOwnerEnvironmentId: 'owner',
      path: '/projects/ordinary-plan',
      branch: 'bw/week-plan'
    } as unknown as Worktree
  ]
  const result = await resolveWorkbenchPromptAssets({
    projectId: 'project',
    repoId: 'repo',
    hostId: 'ssh:host',
    runtimeOwnerEnvironmentId: 'owner',
    worktreeId: 'tree',
    workflow: 'week-planning',
    cycleId: 'cycle'
  })
  expect(result.context).toMatchObject({
    workspacePath: '/projects/ordinary-plan',
    runtimeOwnerEnvironmentId: 'owner',
    hostId: 'ssh:host',
    cycleId: 'cycle',
    version: null
  })
  expect(result.prompt).toContain('ORCA_CLI_COMMAND')
  expect(result.prompt).toContain('ORCA skills get week-planning')
  expect(result.prompt).toContain('ORCA bw materials schema --workflow plan')
  expect(result.prompt).not.toContain('{{')
  expect(result.prompt).not.toContain(String.fromCharCode(92, 110))
  expect(result.prompt).toContain('ORCA bw materials list --help')
  expect(result.prompt).toContain('ORCA bw materials read --help')
  expect(result.prompt).toContain('ORCA bw materials save --help')
  expect(result.prompt).not.toContain('ORCA bw materials --help')
  expect(result.prompt).not.toContain('list/read/save --help')
  expect(result.prompt).not.toContain('/projects/ordinary-plan/standard/')
  expect(result.prompt).not.toMatch(/\borca (?:skills|bw)\b/u)
  await expect(
    resolveWorkbenchPromptAssets({
      projectId: 'project',
      repoId: 'repo',
      hostId: 'ssh:other',
      worktreeId: 'tree',
      workflow: 'week-planning',
      cycleId: 'cycle'
    })
  ).rejects.toThrow('原生工作树不可用')
})

it('routes metric setup to its own native guide without material-write commands', async () => {
  fixture.worktrees = [
    {
      id: 'metrics',
      repoId: 'repo',
      projectId: 'project',
      hostId: 'local',
      path: '/projects/metrics',
      branch: 'bw/metrics'
    } as Worktree
  ]
  const result = await resolveWorkbenchPromptAssets({
    projectId: 'project',
    repoId: 'repo',
    hostId: 'local',
    worktreeId: 'metrics',
    workflow: 'metrics-refresh'
  })
  expect(result.prompt).toContain('ORCA skills get metrics-refresh')
  expect(result.prompt).not.toContain('ORCA skills get week-planning')
  expect(result.prompt).not.toContain('ORCA bw materials')
  expect(result.context.workflow).toBe('metrics-refresh')
})
