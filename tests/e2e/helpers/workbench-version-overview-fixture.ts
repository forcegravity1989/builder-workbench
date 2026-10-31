import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from './workbench-app'
import type { Page } from '@playwright/test'
import type { AcceptanceMaterial } from '../../../src/shared/workbench/version-material'

export const overviewVersions = {
  current: 'v0.334',
  history: 'v0.333',
  error: 'v0.335',
  draftAcceptance: 'v0.337'
}
export const overviewPinnedTitle = '固定验收目标 · 保留原范围'
export const overviewLatestTitle = '最新计划目标 · 不应替代验收范围'
export const overviewFlowPaths = (root: string) => ({
  plan: path.join(root, '.bw', 'worktrees', 'overview-plan'),
  acceptance: path.join(root, '.bw', 'worktrees', 'overview-acceptance')
})
export const overviewRepository = 'https://github.com/forcegravity1989/builder-workbench'

export const overviewTest = test.extend({
  minimumSeededWorktreeCount: 3,
  workbenchAppExtraEnv: {
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  },
  seededRepoPath: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const runtime = path.join(process.cwd(), '.bw', 'runtime', 'verification', 'issue-530')
    mkdirSync(runtime, { recursive: true })
    const root = mkdtempSync(path.join(runtime, 'bw-overview-e2e-'))
    registerPostElectronShutdownCleanup(async () => {
      if (path.dirname(root) !== runtime || !path.basename(root).startsWith('bw-overview-e2e-')) {
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
    const write = (version: string, file: string, document: unknown, workspace = root) => {
      const directory = path.join(workspace, '.bw/planning', version)
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
      workflow: {
        stage: 'archive',
        updatedAt: '2026-10-29T00:00:00Z',
        archivePr: {
          provider: 'github',
          repository: overviewRepository,
          number: version === overviewVersions.history ? 386 : 446
        }
      },
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
      workflow: {
        stage: 'archive',
        updatedAt: '2026-10-29T00:00:00Z',
        archivePr: { provider: 'github', repository: overviewRepository, number: 429 }
      },
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
      timeWindow: { start: '2026-10-26', end: '2026-10-30' },
      goals: [
        ...current.goals,
        { goalId: 'ordinary', title: '普通任务目标', owner: 'E2E fixture', metricTargets: [] }
      ],
      tasks: [
        ...current.tasks,
        { provider: 'github', repository: overviewRepository, number: 440 },
        { provider: 'github', repository: overviewRepository, number: 469, goalId: 'ordinary' }
      ]
    })
    write(overviewVersions.error, 'data.json', {
      schema_version: 3,
      version: overviewVersions.error,
      goals: 'invalid'
    })
    writeFileSync(
      path.join(root, '.bw/milestones.json'),
      JSON.stringify({
        schema_version: 2,
        months: [{ month: '2026-10', outcome: '' }],
        features: [
          {
            id: 'overview-current',
            month: '2026-10',
            title: '版本总览',
            owner: 'E2E fixture',
            deliveries: [
              {
                id: 'overview-current-delivery',
                version: { version: current.version, cycleId: current.cycleId },
                goalId: 'current-goal',
                stages: []
              }
            ]
          }
        ]
      })
    )
    // An explicit planned delivery provides the version-header navigation target.
    git('add', '.bw')
    git('commit', '-m', 'seed isolated current and invalid materials')
    const flows = overviewFlowPaths(root)
    for (const [workflow, directory] of Object.entries(flows)) {
      const branch = `bw/${overviewVersions.draftAcceptance}/${workflow}`
      git('worktree', 'add', '-b', branch, directory, 'main')
    }
    const flowGit = (directory: string, ...args: string[]) =>
      execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
    const writeFlow = (directory: string, file: string, document: unknown) =>
      write(overviewVersions.draftAcceptance, file, document, directory)
    const fixedPlan = {
      ...plan(overviewVersions.draftAcceptance, 'pinned-goal', overviewPinnedTitle),
      workflow: { stage: 'review', updatedAt: '2026-10-29T00:00:00Z' },
      tasks: []
    }
    // Sibling branches: the fixed commit is reachable only from the acceptance tree.
    const fixedRevision = writeFlow(flows.acceptance, 'data.json', fixedPlan)
    flowGit(flows.acceptance, 'add', '.bw')
    flowGit(flows.acceptance, 'commit', '-m', 'seed acceptance-only fixed plan')
    writeFlow(flows.acceptance, 'acceptance.json', {
      schema_version: 3,
      version: fixedPlan.version,
      cycleId: 'overview-draft-acceptance',
      planRef: {
        kind: 'committed',
        version: fixedPlan.version,
        cycleId: fixedPlan.cycleId,
        revision: fixedRevision,
        sourceCommit: flowGit(flows.acceptance, 'rev-parse', 'HEAD')
      },
      preparedArtifacts: [],
      workflow: { stage: 'showcase', updatedAt: '2026-10-29T00:00:00Z' },
      results: [
        {
          goalId: 'pinned-goal',
          readings: [],
          note: '泛化隔离夹具，不是真实项目验收',
          nextStep: '保留原人工结论后继续',
          decision: {
            outcome: 'not-met',
            source: '隔离夹具人工记录',
            recordedAt: '2026-10-29T09:00:00Z',
            materialRevision: fixedRevision,
            reason: '固定范围内仍未达成'
          }
        }
      ]
    })
    writeFlow(flows.plan, 'data.json', {
      ...fixedPlan,
      goals: [{ ...fixedPlan.goals[0], title: overviewLatestTitle }]
    })
    flowGit(flows.plan, 'add', '.bw')
    flowGit(flows.plan, 'commit', '-m', 'seed divergent latest plan with the same identity')
    await provideFixture(root)
    // Only the fixture owns this repository; no command writes to its remote.
  }
})

export function snapshotOverviewMaterials(root: string) {
  const flows = overviewFlowPaths(root)
  return [root, flows.plan, flows.acceptance].map((directory) => {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
    const files = git('ls-files', '-z', '--', '.bw').split('\0').filter(Boolean)
    if (directory === flows.acceptance) {
      files.push(`.bw/planning/${overviewVersions.draftAcceptance}/acceptance.json`)
    }
    return {
      directory,
      head: git('rev-parse', 'HEAD'),
      status: git('status', '--porcelain'),
      files: [...new Set(files)].sort().map((file) => ({
        file,
        sha256: createHash('sha256')
          .update(readFileSync(path.join(directory, file)))
          .digest('hex')
      }))
    }
  })
}

export async function bindOverviewFlowsAndRead(
  page: Page,
  root: string,
  planRef: AcceptanceMaterial['planRef']
) {
  return page.evaluate(
    async ({ root, flows, version, planRef }) => {
      const store = window.__store!
      const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase()
      const repo = store.getState().repos.find((entry) => normalize(entry.path) === normalize(root))
      if (!repo) {
        throw new Error('Isolated overview repository was not registered')
      }
      await store.getState().fetchWorktrees(repo.id)
      const trees = store.getState().worktreesByRepo[repo.id] ?? []
      const scopeFor = (directory: string) => {
        const tree = trees.find((entry) => normalize(entry.path) === normalize(directory))
        if (!tree) {
          throw new Error(`Isolated flow tree was not registered: ${directory}`)
        }
        return { repoId: repo.id, worktreeId: tree.id, hostId: 'local' }
      }
      const invoke = async (method: string, params: unknown) => {
        const response = await window.api.runtime.call({ method, params })
        if (!response.ok) {
          throw new Error(JSON.stringify(response.error))
        }
        return response.result as {
          ok: boolean
          value?: { document: { goals: { title: string }[] } }
          error?: { code: string }
        }
      }
      for (const workflow of ['plan', 'acceptance'] as const) {
        const result = await invoke('workbench.versionBinding.set', {
          ...scopeFor(flows[workflow]),
          binding: { schema: 1, version, workflow }
        })
        if (!result.ok) {
          throw new Error(JSON.stringify(result.error))
        }
      }
      await store.getState().fetchWorktrees(repo.id)
      return Object.fromEntries(
        await Promise.all(
          Object.entries({ home: root, ...flows }).map(async ([name, directory]) => [
            name,
            await invoke('workbench.history.readPlan', { scope: scopeFor(directory), planRef })
          ])
        )
      )
    },
    { root, flows: overviewFlowPaths(root), version: overviewVersions.draftAcceptance, planRef }
  )
}
