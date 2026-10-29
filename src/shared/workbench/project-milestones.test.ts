import { expect, it } from 'vitest'
import { PlanningMaterialSchema } from './version-planning-material'
import {
  milestoneDraft,
  milestoneProblems,
  pickMilestoneVersion,
  reorderMilestoneFeature,
  type MilestoneDraft
} from './project-milestones'

it('keeps planning dates, precise version identity and snapshots through scheduling and reordering', () => {
  const draft: MilestoneDraft = {
    material: {
      schema_version: 1,
      months: [{ month: '2026-11', outcome: '可试用' }],
      features: [
        {
          id: 'f1',
          month: '2026-11',
          title: '消息',
          owner: 'alice',
          pre: { version: 'v1', cycleId: 'one' },
          release: { version: 'v2', cycleId: 'two' }
        },
        {
          id: 'f2',
          month: '2026-11',
          title: '知识库',
          owner: 'bob',
          pre: { version: 'v1', cycleId: 'one' },
          release: { version: 'v1', cycleId: 'one' }
        }
      ]
    },
    versions: [
      { version: 'v1', cycleId: 'one', timeWindow: { start: '2026-11-01', end: '2026-11-28' } },
      { version: 'v2', cycleId: 'two', timeWindow: { start: '2026-11-29', end: '2026-11-30' } }
    ]
  }
  const plan = {
    schema_version: 3,
    version: 'v1',
    cycleId: 'one',
    summary: { progress: '', risks: '' },
    goals: [],
    tasks: []
  }
  expect(PlanningMaterialSchema.parse(plan).timeWindow).toBeUndefined()
  expect(
    PlanningMaterialSchema.parse({ ...plan, timeWindow: draft.versions[0].timeWindow }).timeWindow
  ).toEqual(draft.versions[0].timeWindow)
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      timeWindow: { start: '2026-02-30', end: '2026-03-01' }
    }).success
  ).toBe(false)
  expect(milestoneProblems(draft)).toEqual([])
  const before = milestoneDraft({
    ...draft,
    head: 'a',
    revision: 'b',
    problems: [],
    versions: draft.versions.map((v) => ({ ...v, started: false }))
  })
  draft.material.features = reorderMilestoneFeature(draft.material.features, 'f2', 'f1')
  expect(draft.material.features.map((f) => f.id)).toEqual(['f2', 'f1'])
  expect(before.material.features.map((f) => f.id)).toEqual(['f1', 'f2'])
  expect(
    pickMilestoneVersion(draft.versions, Date.parse('2026-11-27T00:00:00Z') / 86400000)?.cycleId
  ).toBe('one')
  expect(
    pickMilestoneVersion(draft.versions, Date.parse('2026-11-29T00:00:00Z') / 86400000)?.cycleId
  ).toBe('two')
  draft.versions[0].timeWindow = { start: '2026-12-01', end: '2026-12-07' }
  expect(milestoneProblems(draft).join()).toContain('Pre 不能晚于 Release')
  expect(before.versions[0].timeWindow?.start).toBe('2026-11-01')
  draft.material.features[0].pre = { version: 'v1', cycleId: 'wrong-cycle' }
  expect(milestoneProblems(draft).join()).toContain('请安排有日期')
})
