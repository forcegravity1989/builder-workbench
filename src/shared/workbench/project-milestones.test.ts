import { expect, it } from 'vitest'
import {
  adjustMilestoneDelivery,
  adjustMilestoneVersion,
  milestoneLaneConflict,
  orderMilestoneDeliveries,
  plannedDay
} from './milestone-sdlc'
import {
  MilestoneMaterialSchema,
  upgradeMilestoneMaterial,
  milestoneDraft,
  milestoneProblems,
  type MilestoneDraft
} from './project-milestones'
import {
  milestoneCalendar,
  milestoneDay,
  materializeMilestoneWeek,
  editMilestoneVersionName
} from './milestone-calendar'
import { settleMilestoneWindows } from './milestone-window-order'

it('preserves identities through migration and free-date planning without moving version or unrelated feature dates', () => {
  const legacy = {
    schema_version: 3,
    milestones: [{ id: 'launch', month: '2026-11', outcome: '可试用' }],
    features: [
      {
        id: 'f',
        month: '2026-11',
        title: '消息',
        owner: '',
        deliveries: [
          {
            id: 'build',
            version: { version: 'v1', cycleId: 'one' },
            stages: [
              { phase: 'Plan', start: '2026-11-01T00:00', end: '2026-11-02T00:00' },
              { phase: 'Build', start: '2026-11-02T00:00', end: '2026-11-08T00:00' }
            ]
          },
          {
            id: 'm1',
            version: { version: 'v2', cycleId: 'two' },
            stages: [{ phase: 'Maintain', start: '2026-11-08T00:00', end: '2026-11-15T00:00' }]
          },
          {
            id: 'm2',
            version: { version: 'v3', cycleId: 'three' },
            stages: [{ phase: 'Maintain', start: '2026-11-20T00:00', end: '2026-11-27T00:00' }]
          },
          { id: 'unknown', version: { version: 'v4', cycleId: 'four' }, stages: [] }
        ]
      }
    ]
  }
  const material = MilestoneMaterialSchema.parse(upgradeMilestoneMaterial(legacy))
  expect(material.schema_version).toBe(4)
  expect(material.features[0].deliveries[0]).toEqual({
    id: 'build',
    phase: 'Build',
    timeWindow: { start: '2026-11-01T00:00', end: '2026-11-08T00:00' }
  })
  expect(material.features[0].deliveries[3]).toEqual({ id: 'unknown', phase: 'Maintain' })
  expect(material.milestones[0]).toEqual(legacy.milestones[0])
  expect(
    MilestoneMaterialSchema.parse(
      upgradeMilestoneMaterial({
        schema_version: 2,
        months: [{ month: '2026-11', outcome: '保留月份' }],
        features: []
      })
    ).milestones
  ).toEqual([{ id: 'month-2026-11', month: '2026-11', outcome: '保留月份' }])
  const draft: MilestoneDraft = {
    material: {
      ...material,
      features: [...material.features, { ...material.features[0], id: 'other' }]
    },
    versions: [
      { version: 'v1', cycleId: 'one', timeWindow: { start: '2026-11-01', end: '2026-11-07' } },
      { version: 'v2', cycleId: 'two', timeWindow: { start: '2026-11-08', end: '2026-11-14' } }
    ]
  }
  expect(milestoneProblems(draft)).toEqual([])
  const extended = adjustMilestoneDelivery(draft, 'f', 'build', 'end', 20)
  expect(extended.versions).toBe(draft.versions)
  expect(extended.material.features[1]).toBe(draft.material.features[1])
  expect(extended.material.features[0].deliveries.slice(0, 3).map((d) => d.timeWindow)).toEqual([
    { start: '2026-11-01T00:00', end: '2026-11-28T00:00' },
    { start: '2026-11-28T00:00', end: '2026-12-05T00:00' },
    { start: '2026-12-05T00:00', end: '2026-12-12T00:00' }
  ])
  expect(milestoneProblems(extended)).toEqual([])
  expect(
    adjustMilestoneDelivery(extended, 'f', 'build', 'end', -20).material.features[0].deliveries[1]
  ).toEqual(extended.material.features[0].deliveries[1])
  const moved = adjustMilestoneDelivery(draft, 'f', 'm1', 'move', 25)
  expect(milestoneLaneConflict(moved)).toBeUndefined()
  expect(orderMilestoneDeliveries(moved.material.features[0].deliveries).map((d) => d.id)).toEqual([
    'unknown',
    'build',
    'm2',
    'm1'
  ])
  expect(moved.material.features[0].deliveries[2]).toBe(draft.material.features[0].deliveries[2])
  expect(milestoneLaneConflict(adjustMilestoneDelivery(draft, 'f', 'm1', 'move', 13))).toBe('f')
  const half = adjustMilestoneDelivery(draft, 'f', 'build', 'start', 0.5)
  expect(half.material.features[0].deliveries[0].timeWindow?.start).toBe('2026-11-01T12:00')
  expect(adjustMilestoneDelivery(draft, 'f', 'build', 'start', 7)).toBe(draft)
  expect(adjustMilestoneDelivery(draft, 'f', 'unknown', 'move', 1)).toBe(draft)
  const versionMove = adjustMilestoneVersion(draft, 'one', 'move', 1)
  expect(versionMove.material).toBe(draft.material)
  expect(settleMilestoneWindows(draft, versionMove).conflict).toContain('日期重叠')
  expect(
    settleMilestoneWindows(draft, adjustMilestoneVersion(draft, 'one', 'end', -1)).conflict
  ).toBeUndefined()
  expect(editMilestoneVersionName(draft, 'one', 'renamed').draft.material).toBe(draft.material)
  expect(
    editMilestoneVersionName(draft, 'one', '', { previousName: 'v1', registered: [] }).draft
      .versions
  ).toHaveLength(1)
  expect(
    editMilestoneVersionName(draft, 'one', '', { previousName: 'v1', registered: draft.versions })
      .problem
  ).toContain('已提交')
  expect(
    materializeMilestoneWeek(draft, { start: '2026-12-07', end: '2026-12-11' }, 'new', 'v3').draft
      .versions
  ).toHaveLength(3)
  const snapshot = milestoneDraft({
    head: 'a',
    revision: 'b',
    problems: [],
    material: { ...material, versionPlans: draft.versions },
    versions: draft.versions.map((v) => ({ ...v, started: false }))
  })
  expect(snapshot.material).not.toHaveProperty('versionPlans')
  const calendar = milestoneCalendar(draft, '2026-12-02')
  expect(calendar.focusDay).toBe(milestoneDay('2026-11-22'))
  const distant = milestoneCalendar(draft, '2026-12-02', { date: '2040-01-02' })
  expect(distant.end - distant.start).toBeLessThan(560)
  expect(distant.focusDay).toBe(milestoneDay('2040-01-02'))
  expect(plannedDay(material.features[0].deliveries[0].timeWindow!.end)).toBe(
    milestoneDay('2026-11-08')
  )
})
