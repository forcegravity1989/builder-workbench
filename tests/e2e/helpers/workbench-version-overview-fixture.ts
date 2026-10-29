import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from './workbench-app'

export const overviewVersions = { current: 'v0.334', history: 'v0.333', error: 'v0.335' }
export const overviewRepository = 'https://github.com/forcegravity1989/builder-workbench'

export const overviewTest = test.extend({
  minimumSeededWorktreeCount: 1,
  workbenchAppExtraEnv: {
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  },
  seededRepoPath: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bw-overview-e2e-'))
    registerPostElectronShutdownCleanup(async () => {
      if (
        path.dirname(root) !== os.tmpdir() ||
        !path.basename(root).startsWith('bw-overview-e2e-')
      ) {
        throw new Error('Unexpected overview test repository path')
      }
      rmSync(root, { recursive: true, force: true })
    })
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
    git('init', '--initial-branch=main')
    git('config', 'user.name', 'Workbench E2E')
    git('config', 'user.email', 'e2e@test.local')
    git('remote', 'add', 'origin', `${overviewRepository}.git`)
    writeFileSync(path.join(root, '.gitignore'), '.bw/worktrees/\n')
    mkdirSync(path.join(root, '.bw'), { recursive: true })
    writeFileSync(
      path.join(root, '.bw/project.toml'),
      'name = "版本总览隔离验证"\nbrief = "只读 provider 与临时材料验证"\n'
    )
    const write = (version: string, file: string, document: unknown) => {
      const directory = path.join(root, '.bw/planning', version)
      mkdirSync(directory, { recursive: true })
      const raw = `${JSON.stringify(document, null, 2)}\n`
      writeFileSync(path.join(directory, file), raw)
      return `sha256:${createHash('sha256').update(raw).digest('hex')}`
    }
    const plan = (version: string, goalId: string, title: string) => ({
      schema_version: 3,
      version,
      cycleId: `overview-${version}`,
      summary: { progress: '', risks: '' },
      goals: [
        {
          goalId,
          title,
          owner: 'E2E fixture',
          deliverable: '隔离仓测试范围',
          acceptance: '验证来源与入口',
          metricTargets: []
        }
      ],
      tasks: [{ provider: 'github', repository: overviewRepository, number: 334, goalId }]
    })
    const history = plan(overviewVersions.history, 'old-goal', '历史目标 · 保留当时范围')
    const revision = write(history.version, 'data.json', history)
    git('add', '.bw', '.gitignore')
    git('commit', '-m', 'seed isolated historical plan')
    const sourceCommit = git('rev-parse', 'HEAD')
    write(history.version, 'acceptance.json', {
      schema_version: 3,
      version: history.version,
      cycleId: 'overview-acceptance',
      planRef: {
        kind: 'committed',
        version: history.version,
        cycleId: history.cycleId,
        revision,
        sourceCommit
      },
      preparedArtifacts: [],
      results: [
        {
          goalId: 'old-goal',
          readings: [],
          note: '仅测试夹具，不是真实业务验收',
          nextStep: '后续版本继续',
          decision: {
            outcome: 'not-met',
            source: '隔离夹具人工记录',
            recordedAt: '2026-10-20T09:00:00Z',
            materialRevision: revision,
            reason: '测试历史未达成回显'
          }
        }
      ]
    })
    const current = plan(overviewVersions.current, 'current-goal', '当前目标 · 版本总览开发')
    write(current.version, 'data.json', {
      ...current,
      goals: [
        ...current.goals,
        { goalId: 'ordinary', title: '普通任务目标', owner: 'E2E fixture', metricTargets: [] }
      ],
      tasks: [...current.tasks, { provider: 'github', repository: overviewRepository, number: 440 }]
    })
    write(overviewVersions.error, 'data.json', {
      schema_version: 3,
      version: overviewVersions.error,
      goals: 'invalid'
    })
    git('add', '.bw')
    git('commit', '-m', 'seed isolated current and invalid materials')
    await provideFixture(root)
    // Only the fixture owns this repository; no command writes to its remote.
  }
})
