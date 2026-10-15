import { expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import type { MetricCatalog } from '../../../../shared/workbench/metrics'

const fixture = vi.hoisted(() => ({ worktrees: [] as Worktree[] }))
const metrics = vi.hoisted(() => ({
  catalog: { definitions: [], problems: [] } as unknown as MetricCatalog,
  error: null as Error | null
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ repos: [], allWorktrees: () => fixture.worktrees }) }
}))
vi.mock('../metrics-port', () => ({
  nativeMetricsPort: () => ({
    list: async () => {
      if (metrics.error) {
        throw metrics.error
      }
      return metrics.catalog
    }
  })
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
    workflow: 'week-planning'
  })
  expect(result.context).toMatchObject({
    workspacePath: '/projects/ordinary-plan',
    runtimeOwnerEnvironmentId: 'owner',
    hostId: 'ssh:host',
    version: null
  })
  expect(result.prompt).toContain('ORCA_CLI_COMMAND')
  expect(result.prompt).toContain('ORCA skills get week-planning')
  expect(result.prompt).toContain('ORCA bw materials schema --workflow plan')
  expect(result.context).toMatchObject({ branch: 'bw/week-plan' })
  expect(result.prompt).toContain('本会话固定在 bw/week-plan 工作树')
  expect(result.prompt).toContain('不另建工作树或分支')
  expect(result.prompt).toContain('PR/MR 由 bw/week-plan 开向主分支')
  expect(result.prompt).not.toContain('{{')
  expect(result.prompt).not.toContain(String.fromCharCode(92, 110))
  expect(result.prompt).toContain('ORCA bw materials list --help')
  expect(result.prompt).toContain('ORCA bw materials context --help')
  expect(result.prompt).toContain('ORCA bw materials select --help')
  expect(result.context).not.toHaveProperty('cycleId')
  expect(result.prompt).toContain('ORCA bw materials read --help')
  expect(result.prompt).toContain('ORCA bw materials save --help')
  expect(result.prompt).not.toContain('ORCA bw materials --help')
  expect(result.prompt).not.toContain('list/read/save --help')
  expect(result.prompt).not.toContain('/projects/ordinary-plan/standard/')
  expect(result.prompt).not.toMatch(/\borca (?:skills|bw)\b/u)
  const acceptance = await resolveWorkbenchPromptAssets({
    projectId: 'project',
    repoId: 'repo',
    hostId: 'ssh:host',
    runtimeOwnerEnvironmentId: 'owner',
    worktreeId: 'tree',
    workflow: 'version-acceptance'
  })
  expect(acceptance.context).toMatchObject({ branch: 'bw/week-acceptance' })
  expect(acceptance.prompt).toContain('本会话固定在 bw/week-acceptance 工作树')
  expect(acceptance.prompt).toContain('ORCA bw materials schema --workflow acceptance')
  await expect(
    resolveWorkbenchPromptAssets({
      projectId: 'project',
      repoId: 'repo',
      hostId: 'ssh:other',
      worktreeId: 'tree',
      workflow: 'week-planning'
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
  metrics.catalog = {
    definitions: [
      {
        name: '周活跃用户',
        role: 'north_star',
        target: '>= 100',
        unit: '人'
      } as never
    ],
    problems: [{ code: 'collector-required', message: '指标缺少采集配置', name: '构建时长' }]
  } as unknown as MetricCatalog
  metrics.error = null
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
  expect(result.context).toMatchObject({ branch: null })
  expect(result.prompt).not.toContain('本会话固定在')
  expect(result.prompt).toContain('当前指标目录')
  expect(result.prompt).toContain('周活跃用户：角色 north_star，目标 >= 100，单位 人')
  expect(result.prompt).toContain('构建时长：指标缺少采集配置（collector-required）')
})

it('keeps an unreadable metric catalog honest in the setup prompt', async () => {
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
  metrics.error = new Error('目录读取失败')
  const result = await resolveWorkbenchPromptAssets({
    projectId: 'project',
    repoId: 'repo',
    hostId: 'local',
    worktreeId: 'metrics',
    workflow: 'metrics-refresh'
  })
  expect(result.prompt).toContain('指标目录暂不可读：目录读取失败')
  expect(result.prompt).not.toContain('（尚无已登记定义）')
})
