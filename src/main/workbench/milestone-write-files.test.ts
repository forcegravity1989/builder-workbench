import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { readMilestoneDocument, saveMilestoneDocument } from './milestone-document'
import { readMilestoneSnapshot } from './milestone-snapshot'
import { milestoneDraft } from '../../shared/workbench/project-milestones'

it('saves working input and refuses to overwrite a changed or unsafe document', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bw-milestone-cas-'))
  try {
    const project = '.bw/milestones.json'
    const input = {
      schema_version: 4 as const,
      milestones: [{ id: 'launch', date: '2026-11-01', outcome: '' }],
      features: [{ id: 'first', title: '', owner: '', deliveries: [] }]
    }
    expect(await readMilestoneDocument(root)).toEqual({ revision: null, material: null })
    const first = await saveMilestoneDocument(
      root,
      { expectedRevision: null, material: input },
      async () => {}
    )
    expect(await readMilestoneDocument(root)).toEqual(first)
    const external = { ...input, features: [{ ...input.features[0], title: '另一处的安排' }] }
    await writeFile(join(root, project), JSON.stringify(external))
    await expect(
      saveMilestoneDocument(
        root,
        { expectedRevision: first.revision, material: input },
        async () => {}
      )
    ).rejects.toMatchObject({ code: 'revision-conflict' })
    expect(JSON.parse(await readFile(join(root, project), 'utf8'))).toEqual(external)
    const current = await readMilestoneDocument(root)
    await expect(
      saveMilestoneDocument(
        root,
        { expectedRevision: current.revision, material: input },
        async () => {
          throw new Error('worktree changed')
        }
      )
    ).rejects.toThrow('worktree changed')
    expect(await readMilestoneDocument(root)).toEqual(current)
    const unsafe = join(root, 'unsafe')
    await mkdir(join(unsafe, '.bw/milestones.json'), { recursive: true })
    await expect(readMilestoneDocument(unsafe)).rejects.toMatchObject({ code: 'unsafe-path' })

    const repo = join(root, 'version-identity-history')
    const planPath = join(repo, '.bw/planning/v1')
    await mkdir(planPath, { recursive: true })
    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
    git(['init', '-b', 'main'])
    const plan = {
      schema_version: 3,
      version: 'v1',
      cycleId: 'old',
      summary: { progress: '', risks: '' },
      goals: [],
      tasks: []
    }
    await writeFile(join(planPath, 'data.json'), JSON.stringify(plan))
    const commit = () => {
      git(['add', '.bw'])
      git([
        '-c',
        'user.name=fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        'plan material'
      ])
      return git(['rev-parse', 'HEAD'])
    }
    commit()
    git(['branch', 'bw/v1/plan'])
    await writeFile(join(planPath, 'data.json'), JSON.stringify({ ...plan, cycleId: 'current' }))
    const head = commit()
    expect(
      (await readMilestoneSnapshot(repo, head, {}, new Set())).snapshot.versions[0].started
    ).toBe(false)
    git(['branch', '-f', 'bw/v1/plan', head])
    expect(
      (await readMilestoneSnapshot(repo, head, {}, new Set())).snapshot.versions[0].started
    ).toBe(true)
    const actualWindow = { start: '2026-11-01', end: '2026-11-10' }
    const plannedWindow = { start: '2026-11-01', end: '2026-11-05' }
    await writeFile(
      join(planPath, 'data.json'),
      JSON.stringify({ ...plan, cycleId: 'current', timeWindow: actualWindow })
    )
    const legacy = await readMilestoneSnapshot(repo, commit(), {}, new Set())
    expect(legacy.snapshot.material.versionPlans).toBeUndefined()
    expect(legacy.snapshot.versions[0].timeWindow).toEqual(actualWindow)
    await mkdir(join(repo, '.bw/planning/v2'), { recursive: true })
    await writeFile(
      join(repo, '.bw/planning/v2/data.json'),
      JSON.stringify({ ...plan, version: 'v2', cycleId: 'actual-only', timeWindow: actualWindow })
    )
    await writeFile(
      join(repo, project),
      JSON.stringify({
        schema_version: 3,
        milestones: [],
        features: [
          {
            id: 'feature',
            month: '2026-11',
            title: 'Feature',
            owner: 'Builder',
            deliveries: [
              {
                id: 'delivery',
                version: { version: 'v1', cycleId: 'current' },
                goalId: 'retired',
                goalSlot: 1,
                stages: []
              }
            ]
          }
        ],
        versionPlans: [{ version: 'v1', cycleId: 'current', timeWindow: plannedWindow }]
      })
    )
    const planned = await readMilestoneSnapshot(repo, commit(), {}, new Set())
    expect(planned.snapshot.problems).toEqual([])
    expect(planned.snapshot.versions[0].timeWindow).toEqual(plannedWindow)
    expect(planned.snapshot.versions.map((entry) => entry.version)).toEqual(['v1'])
    expect(planned.registeredVersions.map((entry) => entry.version)).toEqual(['v1', 'v2'])
    expect(planned.plans.get('actual-only')?.version).toBe('v2')
    expect(planned.plans.get('current')?.timeWindow).toEqual(actualWindow)
    expect(planned.snapshot.material.features[0].deliveries[0]).not.toHaveProperty('goalId')
    expect(planned.snapshot.material.features[0].deliveries[0]).not.toHaveProperty('goalSlot')
    expect(planned.snapshot.material.features[0].deliveries[0]).toEqual({
      id: 'delivery',
      phase: 'Build'
    })
    expect(planned.snapshot.material.schema_version).toBe(4)
    expect(milestoneDraft(planned.snapshot).material).not.toHaveProperty('versionPlans')
    const roadmap = {
      ...planned.snapshot.material,
      versionPlans: [
        { version: 'v1', cycleId: 'current', timeWindow: plannedWindow },
        { version: 'v3', cycleId: 'schedule-only', timeWindow: plannedWindow }
      ]
    }
    await writeFile(join(repo, project), JSON.stringify(roadmap))
    const scheduledHead = commit()
    const scheduled = await readMilestoneSnapshot(repo, scheduledHead, {}, new Set())
    expect(scheduled.snapshot.problems).toEqual([])
    expect(scheduled.snapshot.versions.find((v) => v.version === 'v3')).toEqual({
      ...roadmap.versionPlans[1],
      started: false
    })
    expect(scheduled.registeredVersions.map((v) => v.version)).toContain('v3')
    expect(scheduled.plans.has('schedule-only')).toBe(false)
    expect(await readdir(join(repo, '.bw/planning'))).not.toContain('v3')
    const active = await readMilestoneSnapshot(repo, scheduledHead, {}, new Set(['v3']))
    expect(active.snapshot.versions.find((v) => v.version === 'v3')?.started).toBe(true)
    await writeFile(
      join(repo, project),
      JSON.stringify({
        ...roadmap,
        versionPlans: [{ version: 'v1', cycleId: 'different', timeWindow: plannedWindow }]
      })
    )
    expect((await readMilestoneSnapshot(repo, commit(), {}, new Set())).snapshot.problems).toEqual([
      'v1：里程碑规划与版本计划身份不一致，请核对材料'
    ])
  } finally {
    // Why maxRetries: Windows git handle release lags, so the first rmdir can hit transient EBUSY.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
