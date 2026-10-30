import { expect, it } from 'vitest'
import {
  defaultMilestoneStages,
  adjustMilestoneDelivery,
  adjustMilestoneVersion,
  plannedDay
} from './milestone-sdlc'
import { workCalendarDay } from './work-calendar'
import { PlanningMaterialSchema } from './version-planning-material'
import {
  milestoneDraft,
  milestoneProblems,
  reorderMilestoneFeature,
  type MilestoneDraft
} from './project-milestones'
import {
  milestoneCalendar,
  milestoneDay,
  milestoneWeekAt,
  materializeMilestoneWeek
} from './milestone-calendar'

it('keeps planning dates, precise version identity and snapshots through scheduling and reordering', () => {
  const draft: MilestoneDraft = {
    material: {
      schema_version: 2,
      months: [{ month: '2026-11', outcome: '可试用' }],
      features: [
        {
          id: 'f1',
          month: '2026-11',
          title: '消息',
          owner: 'alice',
          deliveries: []
        },
        {
          id: 'f2',
          month: '2026-11',
          title: '知识库',
          owner: 'bob',
          deliveries: []
        }
      ]
    },
    versions: [
      { version: 'v1', cycleId: 'one', timeWindow: { start: '2026-11-01', end: '2026-11-28' } },
      { version: 'v2', cycleId: 'two', timeWindow: { start: '2026-11-29', end: '2026-11-30' } }
    ]
  }
  draft.material.features.forEach((f) => {
    f.deliveries = draft.versions.map((v, i) => ({
      id: `${f.id}-${i}`,
      version: { version: v.version, cycleId: v.cycleId },
      stages: defaultMilestoneStages(v, i > 0)
    }))
  })
  expect(
    draft.material.features[0].deliveries[0].stages.map(
      (s) => plannedDay(s.end) - plannedDay(s.start)
    )
  ).toEqual([1, 2, 0.5, 1, 0.5])
  expect(workCalendarDay('2026-11-14').working).toBe(false)
  expect(workCalendarDay('2026-11-16').working).toBe(true)
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
  draft.material.features = reorderMilestoneFeature(draft.material.features, 'f2', 'f1', 'before')
  expect(draft.material.features.map((f) => f.id)).toEqual(['f2', 'f1'])
  expect(before.material.features.map((f) => f.id)).toEqual(['f1', 'f2'])
  const third = { ...before.material.features[0], id: 'f3' }
  const order = [...before.material.features, third]
  expect(reorderMilestoneFeature(order, 'f1', 'f3', 'before').map((f) => f.id)).toEqual([
    'f2',
    'f1',
    'f3'
  ])
  expect(reorderMilestoneFeature(order, 'f1', 'f3', 'after').map((f) => f.id)).toEqual([
    'f2',
    'f3',
    'f1'
  ])
  const shifted = adjustMilestoneVersion(before, 'one', 'move', 1)
  expect(shifted.versions[0].timeWindow?.start).toBe('2026-11-02')
  expect(plannedDay(shifted.material.features[0].deliveries[0].stages[0].start)).toBe(
    plannedDay(before.material.features[0].deliveries[0].stages[0].start) + 1
  )
  const resized = adjustMilestoneDelivery(before, 'f1', 'f1-0', 'end', 0, 0.5)
  expect(resized.material.features[0].deliveries[0].stages[0].end).toBe('2026-11-03T12:00')
  expect(resized.material.features[0].deliveries[0].stages[1].start).toBe('2026-11-03T12:00')
  expect(adjustMilestoneDelivery(before, 'f1', 'f1-0', 'end', 2, -0.5)).toBe(before)
  expect(milestoneProblems(adjustMilestoneVersion(before, 'one', 'end', -27)).join()).toContain(
    '阶段超出'
  )
  const earlyMaintain = adjustMilestoneDelivery(before, 'f1', 'f1-1', 'move', 0, -25)
  expect(milestoneProblems(earlyMaintain).join()).toContain('Maintain 不能早于')
  draft.material.features[0].deliveries[0].version.cycleId = 'wrong-cycle'
  expect(milestoneProblems(draft).join()).toContain('请安排有日期')
  const empty: MilestoneDraft = {
    material: { schema_version: 2, months: [{ month: '2026-07', outcome: '' }], features: [] },
    versions: [{ version: 'v0.7.0', cycleId: 'history' }]
  }
  const week = milestoneWeekAt(milestoneDay('2026-11-14'))
  expect(week).toEqual({ start: '2026-11-09', end: '2026-11-13' })
  expect(milestoneCalendar(empty).versions).toEqual([])
  const used = materializeMilestoneWeek(empty, week, 'new')
  expect(used.version).toEqual({ version: 'v0.7.1', cycleId: 'new', timeWindow: week })
  expect(empty.versions).toHaveLength(1)
  expect(milestoneProblems(used.draft)).toEqual([])
  expect(milestoneCalendar(used.draft).start).toBeLessThanOrEqual(milestoneDay('2026-07-01'))
  expect(materializeMilestoneWeek(used.draft, week, 'unused').version.cycleId).toBe('new')
})
