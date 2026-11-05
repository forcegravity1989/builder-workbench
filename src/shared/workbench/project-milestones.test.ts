import { settleMilestoneWindows } from './milestone-window-order'
import { expect, it } from 'vitest'
import {
  defaultMilestoneStages,
  adjustMilestoneDelivery,
  adjustMilestoneVersion,
  milestoneLaneConflict,
  plannedDay
} from './milestone-sdlc'
import { workCalendarDay } from './work-calendar'
import { PlanningMaterialSchema } from './version-planning-material'
import {
  MilestoneMaterialSchema,
  upgradeMilestoneMaterial,
  milestoneDraft,
  milestoneProblems,
  reorderMilestoneFeature,
  type MilestoneDraft
} from './project-milestones'
import {
  milestoneCalendar,
  milestoneDay,
  milestoneWeekAt,
  materializeMilestoneWeek,
  editMilestoneVersionName,
  newFeatureMilestoneVersions
} from './milestone-calendar'

it('preserves material identity and independent version windows through whole-delivery scheduling', () => {
  const draft: MilestoneDraft = {
    material: {
      schema_version: 3,
      milestones: [{ id: 'launch', date: '2026-11-05', outcome: '可试用' }],
      features: [
        { id: 'f1', month: '2026-11', title: '消息', owner: 'alice', deliveries: [] },
        { id: 'f2', month: '2026-11', title: '知识库', owner: 'bob', deliveries: [] }
      ]
    },
    versions: [
      { version: 'v1', cycleId: 'one', timeWindow: { start: '2026-11-02', end: '2026-11-06' } },
      { version: 'v2', cycleId: 'two', timeWindow: { start: '2026-11-09', end: '2026-11-13' } },
      { version: 'v3', cycleId: 'three', timeWindow: { start: '2026-11-16', end: '2026-11-20' } }
    ]
  }
  draft.material.features.forEach((feature) => {
    feature.deliveries = draft.versions.slice(0, 2).map((version, index) => ({
      id: `${feature.id}-${index}`,
      version: { version: version.version, cycleId: version.cycleId },
      stages: defaultMilestoneStages(version, index > 0)
    }))
  })
  expect(
    draft.material.features[0].deliveries[0].stages.map(
      (stage) => plannedDay(stage.end) - plannedDay(stage.start)
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
  const legacy = {
    schema_version: 2,
    months: [
      { month: '2026-11', outcome: '保留月份' },
      { month: '2026-12', outcome: '' }
    ],
    features: []
  }
  expect(MilestoneMaterialSchema.parse(upgradeMilestoneMaterial(legacy)).milestones).toEqual([
    { id: 'month-2026-11', month: '2026-11', outcome: '保留月份' }
  ])
  const historical = structuredClone(draft)
  historical.material.features.forEach((feature) =>
    feature.deliveries.forEach((delivery) => {
      delivery.stages = []
    })
  )
  expect(milestoneProblems(historical)).toEqual([])
  expect(milestoneLaneConflict(historical)).toBeUndefined()
  expect(adjustMilestoneDelivery(historical, 'f1', 'f1-0', 'move', 1)).toBe(historical)
  const overlappingHistory = adjustMilestoneVersion(historical, 'two', 'move', -7)
  expect(milestoneLaneConflict(overlappingHistory)).toBe('f1')
  expect(milestoneProblems(overlappingHistory).join()).toContain('Maintain 不能早于')
  const undatedHistory = structuredClone(historical)
  delete undatedHistory.versions[0].timeWindow
  expect(milestoneProblems(undatedHistory).join()).toContain('请安排有日期')
  const invalidHistory = structuredClone(historical)
  invalidHistory.versions[0].timeWindow!.end = '2026-02-30'
  expect(milestoneProblems(invalidHistory).join()).toContain('请核对名称及起止日期')

  const before = milestoneDraft({
    ...draft,
    material: { ...draft.material, versionPlans: draft.versions },
    head: 'a',
    revision: 'b',
    problems: [],
    versions: draft.versions.map((version) => ({ ...version, started: true }))
  })
  expect(before.material).not.toHaveProperty('versionPlans')
  draft.material.features = reorderMilestoneFeature(draft.material.features, 'f2', 'f1', 'before')
  expect(draft.material.features.map((feature) => feature.id)).toEqual(['f2', 'f1'])
  expect(before.material.features.map((feature) => feature.id)).toEqual(['f1', 'f2'])
  const order = [...before.material.features, { ...before.material.features[0], id: 'f3' }]
  expect(reorderMilestoneFeature(order, 'f1', 'f3', 'after').map((feature) => feature.id)).toEqual([
    'f2',
    'f3',
    'f1'
  ])
  const shifted = adjustMilestoneVersion(before, 'one', 'move', 1)
  expect(shifted.versions[0].timeWindow).toEqual({ start: '2026-11-03', end: '2026-11-07' })
  expect(shifted.material.features[0].deliveries[0].stages[0].start).toBe('2026-11-03T00:00')
  expect(shifted.material.features[1].deliveries[0].stages[0].start).toBe('2026-11-03T00:00')
  expect(shifted.material.features[0].deliveries[1]).toEqual(
    before.material.features[0].deliveries[1]
  )
  expect(milestoneProblems(shifted)).toEqual([])

  const resized = adjustMilestoneDelivery(before, 'f1', 'f1-0', 'end', 0.5)
  expect(resized.material.features[0].deliveries[0].stages[0].end).toBe('2026-11-03T02:24')
  expect(resized.material.features[0].deliveries[0].stages.at(-1)?.end).toBe('2026-11-07T12:00')
  expect(resized.versions[0].timeWindow).toEqual({ start: '2026-11-02', end: '2026-11-07' })
  expect(resized.versions.slice(1)).toEqual(before.versions.slice(1))
  expect(resized.material.features[1]).toEqual(before.material.features[1])
  expect(milestoneProblems(resized)).toEqual([])
  const shortened = adjustMilestoneDelivery(resized, 'f1', 'f1-0', 'end', -0.5)
  expect(shortened.versions).toEqual(resized.versions)
  expect(shortened.material.features[0].deliveries[0].stages.at(-1)?.end).toBe('2026-11-07T00:00')
  const fractionalBoundary = structuredClone(resized)
  fractionalBoundary.material.features[0].deliveries[0].stages.at(-1)!.end = '2026-11-07T12:01'
  expect(milestoneProblems(fractionalBoundary).join()).toContain('对齐半天')
  fractionalBoundary.material.features[0].deliveries[0].stages[0].end = '2026-11-03T24:00'
  expect(MilestoneMaterialSchema.safeParse(fractionalBoundary.material).success).toBe(false)

  const moved = adjustMilestoneDelivery(before, 'f1', 'f1-1', 'move', 7, before.versions[2])
  expect(moved.versions).toEqual(before.versions)
  expect(moved.material.features[0].deliveries[1].version).toEqual({
    version: 'v3',
    cycleId: 'three'
  })
  expect(moved.material.features[0].deliveries[1].stages).toEqual([
    { phase: 'Maintain', start: '2026-11-16T00:00', end: '2026-11-21T00:00' }
  ])
  expect(moved.material.features[0].deliveries[0]).toEqual(
    before.material.features[0].deliveries[0]
  )
  expect(moved.material.features[1]).toEqual(before.material.features[1])
  expect(milestoneProblems(moved)).toEqual([])
  expect(
    adjustMilestoneDelivery(before, 'f1', 'f1-0', 'move', 7, {
      ...before.versions[1],
      timeWindow: { start: '2026-11-09', end: '2026-11-10' }
    })
  ).toBe(before)

  const expandedVersion = adjustMilestoneVersion(before, 'one', 'end', 1)
  expect(expandedVersion.material).toBe(before.material)
  expect(settleMilestoneWindows(before, expandedVersion).conflict).toBeUndefined()
  const narrowed = settleMilestoneWindows(before, adjustMilestoneVersion(before, 'one', 'end', -1))
  expect(narrowed.conflict).toContain('整段计划超出')
  expect(narrowed.draft).toBe(before)
  const collision = settleMilestoneWindows(before, adjustMilestoneVersion(before, 'one', 'end', 3))
  expect(collision.conflict).toContain('日期重叠')
  expect(collision.draft).toBe(before)
  const parallel = {
    ...before,
    versions: [
      ...before.versions,
      {
        version: 'parallel',
        cycleId: 'parallel',
        timeWindow: { start: '2026-11-04', end: '2026-11-08' }
      }
    ]
  }
  expect(
    settleMilestoneWindows(parallel, adjustMilestoneVersion(parallel, 'one', 'end', 1)).conflict
  ).toBeUndefined()

  const typingName = editMilestoneVersionName(before, 'three', '').draft
  expect(typingName.versions).toHaveLength(3)
  const clearedName = editMilestoneVersionName(typingName, 'three', '', {
    previousName: 'v3',
    registered: before.versions.slice(0, 2)
  })
  expect(clearedName.problem).toBeUndefined()
  expect(clearedName.draft.versions.map((version) => version.cycleId)).toEqual(['one', 'two'])
  const registeredName = editMilestoneVersionName(typingName, 'three', '', {
    previousName: 'v3',
    registered: before.versions
  })
  expect(registeredName.problem).toContain('已提交')
  expect(registeredName.draft.versions).toEqual(before.versions)
  const usedName = editMilestoneVersionName(before, 'one', '', {
    previousName: 'v1',
    registered: []
  })
  expect(usedName.problem).toContain('仍有特性安排')
  expect(usedName.draft).toEqual(before)
  const renamed = editMilestoneVersionName(before, 'one', 'v1-next').draft
  expect(renamed.material.features[0].deliveries[0].version).toEqual({
    version: 'v1-next',
    cycleId: 'one'
  })
  const wrongIdentity = structuredClone(before)
  wrongIdentity.material.features[0].deliveries[0].version.cycleId = 'wrong-cycle'
  expect(milestoneProblems(wrongIdentity).join()).toContain('请安排有日期')
  const defaults = newFeatureMilestoneVersions(before, '2026-11-04')
  expect([defaults.first.cycleId, defaults.next.cycleId]).toEqual(['one', 'two'])
  expect(defaults.draft.versions).toEqual(before.versions)

  const registered = {
    ...before.versions[2],
    timeWindow: { start: '2026-11-16', end: '2026-11-20' }
  }
  const missingFromRoadmap = { ...before, versions: before.versions.slice(0, 2) }
  const reused = newFeatureMilestoneVersions(missingFromRoadmap, '2026-11-17', [
    registered,
    registered
  ])
  expect(reused.first.cycleId).toBe('three')
  expect(reused.draft.versions.filter((v) => v.cycleId === 'three')).toHaveLength(1)
  expect(reused.next.version).not.toBe('v3')

  const empty: MilestoneDraft = {
    material: {
      schema_version: 3,
      milestones: [{ id: 'kickoff', date: '2026-07-01', outcome: '立项' }],
      features: []
    },
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
