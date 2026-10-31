import { settleMilestoneWindows } from './milestone-window-order'
import { frozenMilestoneProblems, restoreFrozenMilestones } from './milestone-freeze'
import { expect, it } from 'vitest'
import {
  defaultMilestoneStages,
  adjustMilestoneDelivery,
  adjustMilestoneVersion,
  fitMilestoneVersions,
  milestoneLaneConflict,
  plannedDay
} from './milestone-sdlc'
import { workCalendarDay } from './work-calendar'
import { PlanningMaterialSchema } from './version-planning-material'
import {
  milestoneDraft,
  milestoneProblems,
  milestoneGoalProblems,
  ScheduledVersionSchema,
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
  const historical = structuredClone(draft)
  historical.material.features.forEach((f) =>
    f.deliveries.forEach((d) => {
      d.stages = []
    })
  )
  expect(milestoneProblems(historical)).toEqual([])
  expect(milestoneLaneConflict(historical)).toBeUndefined()
  expect(adjustMilestoneDelivery(historical, 'f1', 'f1-0', 'move', 0, 1)).toBe(historical)
  expect(fitMilestoneVersions(historical, new Set(['one', 'two']))).toEqual(historical)
  const overlappingHistory = adjustMilestoneVersion(historical, 'two', -1)
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
    head: 'a',
    revision: 'b',
    problems: [],
    versions: draft.versions.map((v) => ({ ...v, started: false }))
  })
  expect(
    frozenMilestoneProblems(
      {
        ...historical,
        head: 'a',
        revision: 'b',
        problems: [],
        versions: historical.versions.map((v) => ({ ...v, started: true }))
      },
      before
    ).join()
  ).toContain('原计划须保留')
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
  const shifted = adjustMilestoneVersion(before, 'one', 1)
  expect(shifted.versions[0].timeWindow?.start).toBe('2026-11-02')
  expect(plannedDay(shifted.material.features[0].deliveries[0].stages[0].start)).toBe(
    plannedDay(before.material.features[0].deliveries[0].stages[0].start) + 1
  )
  const resized = adjustMilestoneDelivery(before, 'f1', 'f1-0', 'end', 0, 0.5)
  expect(resized.material.features[0].deliveries[0].stages[0].end).toBe('2026-11-03T12:00')
  expect(resized.material.features[0].deliveries[0].stages[1].start).toBe('2026-11-03T12:00')
  expect(adjustMilestoneDelivery(before, 'f1', 'f1-0', 'end', 2, -0.5)).toBe(before)
  const fitted = fitMilestoneVersions(before, new Set(['one']))
  const longer = adjustMilestoneDelivery(fitted, 'f1', 'f1-0', 'end', 1, 5)
  expect(longer.versions[0].timeWindow).toEqual({ start: '2026-11-02', end: '2026-11-11' })
  expect(milestoneProblems(longer)).toEqual([])
  expect(adjustMilestoneDelivery(longer, 'f1', 'f1-0', 'end', 1, -5).versions).toEqual(
    fitted.versions
  )
  expect(milestoneLaneConflict(fitted)).toBeUndefined()
  expect(milestoneLaneConflict(adjustMilestoneVersion(fitted, 'one', 25))).toBe('f1')
  const touching = adjustMilestoneVersion(fitted, 'two', -22)
  expect(milestoneLaneConflict(touching)).toBeUndefined()
  expect(milestoneLaneConflict(adjustMilestoneVersion(fitted, 'two', -23))).toBe('f1')
  const withEmpty = {
    ...fitted,
    versions: [
      ...fitted.versions,
      { version: 'v3', cycleId: 'three', timeWindow: { start: '2026-11-09', end: '2026-11-13' } },
      { version: 'v4', cycleId: 'four', timeWindow: { start: '2026-11-16', end: '2026-11-20' } }
    ]
  }
  const expanded = adjustMilestoneDelivery(withEmpty, 'f1', 'f1-0', 'end', 1, 5)
  const settled = settleMilestoneWindows(withEmpty, expanded, new Set())
  expect(settled.conflict).toBeUndefined()
  expect(settled.draft.versions.slice(2).map((v) => v.timeWindow)).toEqual([
    { start: '2026-11-12', end: '2026-11-16' },
    { start: '2026-11-17', end: '2026-11-21' }
  ])
  expect(settled.draft.material).toBe(expanded.material)
  expect(withEmpty.versions[2].timeWindow?.start).toBe('2026-11-09')
  expect(milestoneProblems(settled.draft)).toEqual([])
  const shortened = settleMilestoneWindows(
    settled.draft,
    adjustMilestoneDelivery(settled.draft, 'f1', 'f1-0', 'end', 1, -5),
    new Set()
  )
  expect(shortened.draft.versions.slice(2)).toEqual(settled.draft.versions.slice(2))
  for (const frozenId of ['three', 'four']) {
    const blocked = settleMilestoneWindows(withEmpty, expanded, new Set([frozenId]))
    expect(blocked.conflict).toBeTruthy()
    expect(blocked.draft).toBe(withEmpty)
  }
  const occupied = structuredClone(withEmpty)
  occupied.material.features.push({
    id: 'occupied',
    month: '2026-11',
    title: '已有排期',
    owner: 'bob',
    deliveries: [
      {
        id: 'occupied-0',
        version: { version: 'v4', cycleId: 'four' },
        stages: defaultMilestoneStages(occupied.versions[3])
      }
    ]
  })
  expect(
    settleMilestoneWindows(
      occupied,
      adjustMilestoneDelivery(occupied, 'f1', 'f1-0', 'end', 1, 5),
      new Set()
    ).conflict
  ).toBeTruthy()
  const parallel = structuredClone(occupied)
  parallel.versions[3].timeWindow = { start: '2026-11-02', end: '2026-11-06' }
  parallel.material.features[2].deliveries[0].stages = defaultMilestoneStages(parallel.versions[3])
  expect(
    settleMilestoneWindows(
      parallel,
      adjustMilestoneDelivery(parallel, 'f1', 'f1-0', 'end', 1, 0.5),
      new Set()
    ).conflict
  ).toBeUndefined()
  const withEarlierEmpty = {
    ...withEmpty,
    versions: withEmpty.versions.map((v) =>
      v.cycleId === 'three'
        ? { ...v, timeWindow: { start: '2026-10-26', end: '2026-10-30' } }
        : v.cycleId === 'four'
          ? { ...v, timeWindow: { start: '2026-10-19', end: '2026-10-23' } }
          : v
    )
  }
  const expandedLeft = adjustMilestoneDelivery(withEarlierEmpty, 'f1', 'f1-0', 'start', 0, -5)
  const settledLeft = settleMilestoneWindows(withEarlierEmpty, expandedLeft, new Set())
  expect(settledLeft.conflict).toBeUndefined()
  expect(settledLeft.draft.versions.slice(2).map((v) => v.timeWindow)).toEqual([
    { start: '2026-10-23', end: '2026-10-27' },
    { start: '2026-10-18', end: '2026-10-22' }
  ])
  expect(settledLeft.draft.versions.map((v) => v.cycleId)).toEqual(
    withEarlierEmpty.versions.map((v) => v.cycleId)
  )
  expect(settledLeft.draft.material).toBe(expandedLeft.material)
  expect(withEarlierEmpty.versions[2].timeWindow?.start).toBe('2026-10-26')
  expect(milestoneProblems(settledLeft.draft)).toEqual([])
  expect(
    settleMilestoneWindows(
      settledLeft.draft,
      adjustMilestoneDelivery(settledLeft.draft, 'f1', 'f1-0', 'start', 0, 5),
      new Set()
    ).draft.versions.slice(2)
  ).toEqual(settledLeft.draft.versions.slice(2))
  for (const frozenId of ['three', 'four']) {
    const blocked = settleMilestoneWindows(withEarlierEmpty, expandedLeft, new Set([frozenId]))
    expect(blocked.conflict).toBeTruthy()
    expect(blocked.draft).toBe(withEarlierEmpty)
  }
  const occupiedLeft = structuredClone(withEarlierEmpty)
  occupiedLeft.material.features.push({
    id: 'earlier-work',
    month: '2026-11',
    title: '前面的排期',
    owner: 'bob',
    deliveries: [
      {
        id: 'earlier-work-0',
        version: { version: 'v4', cycleId: 'four' },
        stages: defaultMilestoneStages(occupiedLeft.versions[3])
      }
    ]
  })
  expect(milestoneProblems(occupiedLeft)).toEqual([])
  for (const delta of [-5, -14]) {
    const blocked = settleMilestoneWindows(
      occupiedLeft,
      adjustMilestoneDelivery(occupiedLeft, 'f1', 'f1-0', 'start', 0, delta),
      new Set()
    )
    expect(blocked.conflict).toBeTruthy()
    expect(blocked.draft).toBe(occupiedLeft)
  }
  const parallelLeft = structuredClone(occupiedLeft)
  parallelLeft.versions[3].timeWindow = { start: '2026-11-02', end: '2026-11-06' }
  parallelLeft.material.features[2].deliveries[0].stages = defaultMilestoneStages(
    parallelLeft.versions[3]
  )
  expect(
    settleMilestoneWindows(
      parallelLeft,
      adjustMilestoneDelivery(parallelLeft, 'f1', 'f1-0', 'start', 0, -0.5),
      new Set()
    ).conflict
  ).toBeUndefined()
  const earlyMaintain = adjustMilestoneDelivery(before, 'f1', 'f1-1', 'move', 0, -25)
  expect(milestoneProblems(earlyMaintain).join()).toContain('Maintain 不能早于')
  const frozen = {
    ...before,
    head: 'a',
    revision: 'b',
    problems: [],
    versions: before.versions.map((v) => ({ ...v, started: v.cycleId === 'one' }))
  }
  expect(frozenMilestoneProblems(frozen, before)).toEqual([])
  expect(frozenMilestoneProblems(frozen, shifted).join()).toContain('日期已锁定')
  expect(frozenMilestoneProblems(frozen, resized).join()).toContain('原计划须保留')
  expect(frozenMilestoneProblems(frozen, earlyMaintain)).toEqual([])
  const renamed = structuredClone(before)
  renamed.material.features.reverse()
  renamed.material.features[0].title = '新的宏观描述'
  expect(frozenMilestoneProblems(frozen, renamed)).toEqual([])
  renamed.material.features.pop()
  expect(frozenMilestoneProblems(frozen, renamed).join()).toContain('不能新增、移除或调整阶段')
  const mixed = adjustMilestoneDelivery(resized, 'f1', 'f1-1', 'end', 0, -1)
  mixed.material.features[0].deliveries[0].goalSlot = 2
  mixed.material.features[0].deliveries[0].goalId = 'goal-2'
  const withGoals = {
    ...frozen,
    versions: frozen.versions.map((v) => ({ ...v, goals: [{ goalId: 'goal-2', title: '目标二' }] }))
  }
  expect(milestoneGoalProblems(mixed, withGoals.versions)).toEqual([])
  expect(milestoneGoalProblems(mixed, frozen.versions)).toHaveLength(1)
  mixed.material.features[0].owner = '新的负责人'
  const restored = restoreFrozenMilestones(withGoals, mixed)
  expect(restored.versions.every((v) => ScheduledVersionSchema.safeParse(v).success)).toBe(true)
  expect(restored.material.features[0].deliveries[0].goalId).toBe('goal-2')
  expect(frozenMilestoneProblems(frozen, restored)).toEqual([])
  expect(restored.material.features[0].owner).toBe('新的负责人')
  expect(restored.material.features[0].deliveries[1]).toEqual(
    mixed.material.features[0].deliveries[1]
  )
  expect(restoreFrozenMilestones(frozen, renamed).material.features).toHaveLength(2)
  const reassigned = structuredClone(before)
  reassigned.material.features[0].deliveries[0].version = { version: 'v2', cycleId: 'two' }
  reassigned.material.features[0].deliveries[1].version = { version: 'v1', cycleId: 'one' }
  const restoredAssignment = restoreFrozenMilestones(frozen, reassigned)
  expect(restoredAssignment.material.features[0].deliveries).toEqual(
    before.material.features[0].deliveries
  )
  expect(milestoneProblems(restoredAssignment)).toEqual([])
  expect(
    restoreFrozenMilestones(frozen, earlyMaintain).material.features[0].deliveries[0].stages[0]
      .phase
  ).toBe('Plan')
  const newMixed = structuredClone(before)
  newMixed.material.features.push({ ...structuredClone(before.material.features[0]), id: 'new' })
  expect(restoreFrozenMilestones(frozen, newMixed).material.features.map((f) => f.id)).toEqual([
    'f1',
    'f2'
  ])
  expect(
    frozenMilestoneProblems(
      { ...frozen, versions: frozen.versions.map((v) => ({ ...v, started: false })) },
      resized,
      new Set(['v1'])
    ).join()
  ).toContain('原计划须保留')
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
