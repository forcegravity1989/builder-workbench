import { expect, it } from 'vitest'
import { sdlcProviderOf } from '../overview-sdlc'
import {
  featureNumber,
  linkedPullNumbers,
  pullDeclaresIssue,
  pullPhase,
  taskKey,
  referenceForPlan,
  type FeaturePull
} from './feature-model'
import { versionDeliveryEvents, type VersionEvidence } from './version-evidence'
import { cycleBaseline, featureTimeline, featureStage } from './feature-timeline'
import { featureTimelineLayout } from './feature-timeline-layout'
import { OverviewPullSchema } from '../../../../shared/workbench/overview-pull'
import { materialSourceInputs } from './material-cache'
import {
  matchMilestoneFeature,
  milestoneStageHours,
  milestoneVersionKey,
  type MilestoneVersionFacts
} from '../milestone-feature-facts'
import type { MilestoneMaterial } from '../../../../shared/workbench/project-milestones'
import { milestoneActualCalendar, milestoneActualLayout } from '../milestone-actual-layout'
import { milestoneDay } from '../../../../shared/workbench/milestone-calendar'

it('projects scoped feature evidence without turning missing, later or unrelated records into delivery', () => {
  expect(sdlcProviderOf({ upstream: { owner: 'acme', repo: 'app' } })).toBe('github')
  expect(
    sdlcProviderOf({
      gitRemoteIdentity: {
        remoteUrl: 'git@codehub.example.com:g/p.git',
        canonicalKey: 'codehub.example.com/g/p',
        remoteName: 'origin'
      }
    })
  ).toBe('codehub')
  expect(
    sdlcProviderOf({
      gitRemoteIdentity: {
        remoteUrl: 'https://gitlab.com/g/p.git',
        canonicalKey: 'gitlab.com/g/p',
        remoteName: 'origin'
      }
    })
  ).toBeNull()
  expect(sdlcProviderOf(null)).toBeNull()
  const reference = {
    provider: 'github',
    repository: 'https://github.com/acme/app.git',
    number: 334,
    goalId: 'g2'
  }
  const url = 'https://github.com/acme/app/pull/459'
  const metadata = {
    number: 459,
    url,
    title: 'design',
    body: '',
    state: 'merged',
    readAt: '2026-10-29T00:00:00.000Z'
  }
  expect(OverviewPullSchema.safeParse(metadata).success).toBe(true)
  expect(OverviewPullSchema.safeParse({ ...metadata, body: null }).success).toBe(false)
  expect(OverviewPullSchema.safeParse({ ...metadata, state: 'unknown' }).success).toBe(false)
  const primary = { id: 'main', repoId: 'repo', isArchived: false }
  expect(materialSourceInputs([primary], [], 'v0.8', true)).toBe(
    materialSourceInputs([primary, { ...primary, id: 'unrelated-discovery' }], [], 'v0.8', true)
  )
  const flow = {
    ...primary,
    id: 'acceptance',
    workbenchVersionBinding: {
      schema: 1 as const,
      version: 'v0.8',
      workflow: 'acceptance' as const
    }
  }
  expect(materialSourceInputs([flow], [], 'v0.8', true)).not.toBe(
    materialSourceInputs([], [], 'v0.8', true)
  )
  expect(materialSourceInputs([flow], [], 'v0.7', true)).toBe(
    materialSourceInputs([], [], 'v0.7', true)
  )
  expect(referenceForPlan(reference, [{ ...reference, goalId: 'new-goal' }]).goalId).toBe(
    'new-goal'
  )
  expect(referenceForPlan(reference, []).goalId).toBeUndefined()
  expect(taskKey(reference)).toBe(
    taskKey({ ...reference, repository: 'git@github.com:acme/app.git' })
  )
  expect(taskKey(reference)).not.toBe(
    taskKey({ ...reference, repository: 'https://github.com/acme/other.git' })
  )
  expect(featureNumber({ iid: 334, title: '总览', labels: ['Feature'] })).toBeNull()
  expect(featureNumber({ iid: 334, title: '总览', labels: ['特性'] })).toBe(334)
  expect(featureNumber({ iid: 500, title: '【v1|G2】【特性#334】执行', labels: [] })).toBe(334)
  expect(featureNumber({ iid: 500, title: '【特性#334】【特性#440】执行' })).toBeNull()
  expect(
    linkedPullNumbers(
      `${url} https://github.com/acme/other/pull/459`,
      'https://github.com/acme/app/issues/334'
    )
  ).toEqual([459])
  expect(
    linkedPullNumbers(
      'https://codehub.example/g/p/-/merge_requests/3',
      'https://codehub.example/g/p/-/issues/1'
    )
  ).toEqual([3])
  expect(
    linkedPullNumbers(
      'https://codehub.example/g/p/merge_requests/3 https://codehub.example/g/other/merge_requests/4 https://codehub-other.example/g/p/merge_requests/5',
      'https://codehub.example/g/p/issues/1'
    )
  ).toEqual([3])
  expect(pullPhase('', `设计 PR：${url}`, url)).toBe('design')
  expect(
    pullPhase(
      '交付阶段：Build',
      '开发 MR：https://codehub.example/g/p/-/merge_requests/3',
      'https://codehub.example/g/p/merge_requests/3'
    )
  ).toBe('development')
  expect(
    pullPhase(
      '交付阶段：Design',
      '设计 MR：https://codehub.example/g/p/merge_requests/3',
      'https://codehub.example/g/p/-/merge_requests/3'
    )
  ).toBe('design')
  expect(
    pullPhase(
      '',
      '开发 MR：https://codehub.example/g/other/merge_requests/3',
      'https://codehub.example/g/p/merge_requests/3'
    )
  ).toBe('unknown')
  expect(pullPhase('交付阶段：开发', `设计 PR：${url}`, url)).toBe('unknown')
  expect(pullPhase('交付阶段：Build', `设计 PR：${url}`, url)).toBe('unknown')
  expect(pullPhase('交付阶段：设计\n阶段：Design')).toBe('design')
  expect(pullPhase('changed intent.md, spec.md')).toBe('unknown')
  const featureIssueUrl = 'https://github.com/acme/app/issues/440'
  expect(pullDeclaresIssue('关联 #334\n\n交付阶段：开发\n参考 #440', featureIssueUrl)).toBe(false)
  expect(pullDeclaresIssue('关联 #334、#440\r\n\r\n交付阶段：开发', featureIssueUrl)).toBe(true)
  expect(pullDeclaresIssue(`关联：${featureIssueUrl}`, featureIssueUrl)).toBe(true)
  expect(pullDeclaresIssue('关联 https://github.com/acme/other/issues/440', featureIssueUrl)).toBe(
    false
  )
  expect(
    pullDeclaresIssue('关联 https://github.example/acme/app/issues/440', featureIssueUrl)
  ).toBe(false)
  expect(pullDeclaresIssue('关联 #334 的实现，参考 #440', featureIssueUrl)).toBe(false)
  expect(pullDeclaresIssue('关联 #4400', featureIssueUrl)).toBe(false)
  const pull: FeaturePull = {
    number: 459,
    title: 'design',
    url,
    body: '交付阶段：设计',
    state: 'merged',
    createdAt: '2026-10-01T08:00:00Z',
    mergedAt: '2026-10-01T10:00:00Z',
    readAt: '2026-10-10T00:00:00Z'
  }
  const intentEvent = {
    id: 'plan',
    phase: 'intent' as const,
    label: '计划 PR 合入',
    at: '2026-10-01T07:00:00Z',
    url,
    readAt: pull.readAt,
    rule: 'fixture'
  }
  const record = (version: string, outcome?: 'met' | 'not-met' | 'pending'): VersionEvidence => ({
    version,
    at: `2026-10-0${version}T12:00:00Z`,
    revision: version.repeat(40),
    readAt: pull.readAt,
    plan: { goals: [{ goalId: 'g2', title: '目标', metricTargets: [] }], tasks: [reference] },
    acceptance: {
      results: outcome
        ? [
            {
              goalId: 'g2',
              readings: [],
              note: '',
              nextStep: '',
              decision: {
                outcome,
                source: 'human',
                recordedAt: pull.readAt,
                materialRevision: `sha256:${'a'.repeat(64)}`,
                reason: ''
              }
            }
          ]
        : []
    }
  })
  const deliveries = versionDeliveryEvents(
    [
      record('1'),
      record('2', 'pending'),
      record('3', 'not-met'),
      record('4', 'met'),
      record('5', 'met')
    ],
    new Set([taskKey(reference)])
  )
  expect(deliveries.map((event) => event.delivered)).toEqual([false, false, false, true, true])
  expect(deliveries[3]?.label).toContain('首次交付')
  expect(deliveries[4]?.label).toContain('维护交付')
  expect(
    versionDeliveryEvents(
      [record('4', 'met')],
      new Set([taskKey(reference)]),
      '2026-10-03T12:00:00Z'
    )
  ).toEqual([])
  expect(versionDeliveryEvents([record('4', 'met')], new Set())).toEqual([])
  const incomplete = versionDeliveryEvents(
    [record('4', 'met')],
    new Set([taskKey(reference)]),
    undefined,
    false
  )
  expect(incomplete[0]?.delivered).toBe(true)
  expect(incomplete[0]?.label).toContain('顺序未确认')
  expect(cycleBaseline('2026-10-27T07:17:18Z')).toBe('2026-10-26T01:00:00.000Z')
  const timelineFeature = {
    root: {
      reference,
      source: {
        kind: 'task-source',
        provider: 'github',
        projectId: 'test',
        hostId: 'local',
        repoId: 'repo'
      },
      title: '特性',
      iid: 334,
      state: 'open',
      url: 'https://github.com/acme/app/issues/334',
      readAt: pull.readAt
    },
    body: '',
    members: [],
    pulls: [{ ...pull, phase: 'design' as const }],
    problems: [],
    versions: [],
    events: [
      { ...intentEvent, phase: 'intent' as const, at: '2026-10-01T07:00:00Z' },
      ...deliveries
    ]
  } as Parameters<typeof featureTimeline>[0]
  const goalFeature = { ...timelineFeature, members: [timelineFeature.root] }
  const facts: MilestoneVersionFacts = {
    plan: {
      version: 'v0.8',
      cycleId: 'cycle-eight',
      goals: [{ goalId: 'g2', title: '目标', metricTargets: [] }]
    },
    features: [goalFeature],
    loading: false,
    failed: false,
    stale: false
  }
  const material: MilestoneMaterial = {
    schema_version: 2,
    months: [{ month: '2026-10', outcome: '' }],
    features: [
      {
        id: 'planned',
        month: '2026-10',
        title: '任意标题',
        owner: 'builder',
        deliveries: [
          {
            id: 'delivery',
            version: { version: 'v0.8', cycleId: 'cycle-eight' },
            goalId: 'g2',
            stages: [{ phase: 'Test', start: '2026-10-29T00:00', end: '2026-10-30T12:00' }]
          }
        ]
      }
    ]
  }
  const delivery = material.features[0]!.deliveries[0]!
  expect(matchMilestoneFeature(delivery, facts, material)).toBe(goalFeature)
  expect(
    matchMilestoneFeature(
      { ...delivery, version: { ...delivery.version, cycleId: 'different' } },
      facts,
      material
    )
  ).toBeUndefined()
  expect(
    matchMilestoneFeature({ ...delivery, goalId: undefined, goalSlot: 2 }, facts, material)
  ).toBeUndefined()
  expect(matchMilestoneFeature(delivery, { ...facts, failed: true }, material)).toBeUndefined()
  expect(
    matchMilestoneFeature(
      delivery,
      {
        ...facts,
        features: [goalFeature, { ...goalFeature, root: { ...goalFeature.root, iid: 440 } }]
      },
      material
    )
  ).toBeUndefined()
  expect(milestoneStageHours(material, facts, goalFeature)).toEqual({ Test: 36 })
  const continuedMaterial = structuredClone(material)
  const continued = {
    ...delivery,
    id: 'later',
    version: { version: 'v0.9', cycleId: 'cycle-nine' },
    stages: [{ phase: 'Maintain' as const, start: '2026-11-02T00:00', end: '2026-11-06T12:00' }]
  }
  continuedMaterial.features[0]!.deliveries.push(continued)
  const finalFeature = {
    ...goalFeature,
    observedAt: '2027-01-07T08:00:00Z',
    pulls: [
      ...goalFeature.pulls,
      { ...pull, number: 474, phase: 'development' as const, mergedAt: '2027-01-05T08:00:00Z' }
    ],
    events: [
      intentEvent,
      {
        ...intentEvent,
        id: 'first',
        phase: 'version' as const,
        delivered: true,
        deliveryKind: 'first' as const,
        at: '2027-01-06T08:00:00Z'
      }
    ]
  }
  const projectedFacts = {
    [milestoneVersionKey(delivery.version)]: {
      ...facts,
      features: [{ ...goalFeature, observedAt: '2026-10-02T08:00:00Z' }]
    },
    [milestoneVersionKey(continued.version)]: {
      ...facts,
      plan: { ...facts.plan!, ...continued.version },
      features: [finalFeature]
    }
  }
  const started = new Set(['cycle-eight', 'cycle-nine'])
  const actual = milestoneActualLayout(
    continuedMaterial.features[0]!,
    continuedMaterial,
    projectedFacts,
    started
  )
  expect(actual.stages.find((stage) => stage.id === 'Build')?.end).toBe('2027-01-05T08:00:00Z')
  expect(actual.stages.filter((stage) => stage.id === 'Test')).toHaveLength(1)
  expect(
    milestoneActualCalendar({ material: continuedMaterial, versions: [] }, projectedFacts, started)
      .end
  ).toBeGreaterThanOrEqual(milestoneDay('2027-01-06'))
  expect(
    milestoneStageHours(
      {
        ...material,
        features: [...material.features, { ...material.features[0]!, id: 'another' }]
      },
      facts,
      goalFeature
    )
  ).toEqual({})
  const futureFeature = { ...timelineFeature, pulls: [], events: [] }
  const plannedLayout = featureTimelineLayout(futureFeature, { Test: 36 })
  expect(plannedLayout.slots[3]).toMatchObject({
    hours: 36,
    planned: true,
    placeholder: true,
    start: undefined,
    end: undefined
  })
  expect(featureTimelineLayout(futureFeature).slots[3]).toMatchObject({ hours: 24, planned: false })
  expect(featureStage(timelineFeature, false)).toContain('Maintain')
  const timeline = featureTimeline(timelineFeature)
  expect(timeline.points.design?.at).toBe(pull.mergedAt)
  expect(
    featureTimeline({ ...timelineFeature, problems: ['PR 读取失败'] }).points.design
  ).toBeUndefined()
  expect(timeline.points.first?.at).toBe(record('4', 'met').at)
  expect(timeline.deliveries.at(-1)?.at).toBe(record('5', 'met').at)
  expect(timeline.segments.find((segment) => segment.id === 'Design')?.duration).toBe(3 * 3600000)
  expect(timeline.segments.find((segment) => segment.id === 'Test')?.duration).toBeNull()
  expect(
    featureTimeline({
      ...timelineFeature,
      pulls: [pull, pull].map((item) => ({ ...item, phase: 'design' as const }))
    }).points.design
  ).toBeUndefined()
  expect(
    featureTimeline({
      ...timelineFeature,
      closedAt: '2026-10-02T08:00:00Z',
      root: { ...timelineFeature.root, state: 'closed' }
    }).points.development?.url
  ).toBe(timelineFeature.root.url)
  expect(
    featureTimeline({
      ...timelineFeature,
      problems: ['关联 PR 未读全'],
      closedAt: '2026-10-02T08:00:00Z',
      root: { ...timelineFeature.root, state: 'closed' }
    }).points.development
  ).toBeUndefined()
  const future = [
    record('4', 'met'),
    { ...record('5', 'met'), at: '2026-10-09T00:00:00Z' },
    { ...record('5', 'met'), at: '2026-10-09T00:00:00Z' }
  ]
  expect(
    versionDeliveryEvents(future, new Set([taskKey(reference)]), '2026-10-05T00:00:00Z')[0]
      ?.deliveryKind
  ).toBe('first')
  const unlocated = featureTimeline({
    ...timelineFeature,
    events: [],
    pulls: [],
    archives: [{ ...intentEvent, phase: 'intent', at: '' }]
  })
  expect(unlocated.points.intent).toBeUndefined()
  expect(unlocated.sources.find((source) => source.id === 'Plan')?.events[0]?.url).toBe(url)
  const maintenanceFeature = {
    ...timelineFeature,
    observedAt: '2026-10-10T12:00:00Z',
    events: [
      {
        ...intentEvent,
        id: 'plan4',
        phase: 'intent' as const,
        version: '4',
        at: '2026-10-04T08:00:00Z'
      },
      ...versionDeliveryEvents(
        [record('4', 'met'), record('5', 'not-met'), record('6', 'met'), record('7', 'met')],
        new Set([taskKey(reference)])
      ),
      {
        ...intentEvent,
        id: 'plan5',
        phase: 'intent' as const,
        version: '5',
        at: '2026-10-05T08:00:00Z'
      },
      {
        ...intentEvent,
        id: 'plan6',
        phase: 'intent' as const,
        version: '6',
        at: '2026-10-06T08:00:00Z'
      },
      {
        ...intentEvent,
        id: 'plan7',
        phase: 'intent' as const,
        version: '7',
        at: '2026-10-07T08:00:00Z'
      }
    ]
  }
  const maintenance = featureTimeline(maintenanceFeature)
  expect(maintenance.deliveries).toHaveLength(3)
  expect(maintenance.segments.find((s) => s.id === 'Deploy')?.duration).toBeNull()
  expect(maintenance.segments.find((s) => s.id === 'Maintain')).toMatchObject({
    start: record('4', 'met').at,
    end: record('7', 'met').at,
    ongoing: false
  })
  const next = featureTimeline({
    ...maintenanceFeature,
    events: [
      ...maintenanceFeature.events,
      { ...intentEvent, id: 'plan8', phase: 'intent', version: '8', at: '2026-10-07T09:00:00Z' }
    ]
  })
  expect(next.segments.find((s) => s.id === 'Maintain')).toMatchObject({
    start: record('4', 'met').at,
    end: maintenanceFeature.observedAt,
    ongoing: true
  })
  const overlap = featureTimeline({
    ...maintenanceFeature,
    events: maintenanceFeature.events
      .filter((e) => e.version === '4')
      .concat({
        ...intentEvent,
        id: 'early5',
        phase: 'intent',
        version: '5',
        at: '2026-10-04T09:00:00Z'
      })
  })
  expect(overlap.segments.find((s) => s.id === 'Maintain')).toMatchObject({
    ongoing: true,
    start: record('4', 'met').at
  })
  const building = {
    ...timelineFeature,
    events: timelineFeature.events.filter((e) => e.phase === 'intent'),
    observedAt: '2026-10-02T10:00:00Z',
    pulls: [
      ...timelineFeature.pulls,
      {
        ...pull,
        number: 474,
        url: url.replace('459', '474'),
        phase: 'development' as const,
        state: 'draft',
        mergedAt: null
      }
    ]
  }
  const layout = featureTimelineLayout(building)
  expect(layout.slots.map((slot) => slot.state)).toEqual([
    'done',
    'done',
    'current',
    'future',
    'untracked',
    'future'
  ])
  expect(layout.slots[2]?.source?.url).toContain('/474')
  expect(layout.slots[2]?.duration).toBe(24 * 3600000)
  expect(layout.slots[3]).toMatchObject({ hours: 24, duration: null, source: undefined })
  expect(layout.slots[4]).toMatchObject({ hours: 12, duration: null, hint: '部署时间 · 未跟踪' })
  expect(layout.slots[5]?.end).toBeUndefined()
  const maintained = featureTimelineLayout(maintenanceFeature)
  expect(maintained.slots[5]?.duration).toBe(maintenance.segments[5]?.duration)
  expect(maintained.slots[5]?.source?.at).toBe(record('7', 'met').at)
  expect(
    featureTimelineLayout({ ...building, problems: ['读取失败'] }).slots.some(
      (s) => s.state === 'current'
    )
  ).toBe(false)
  const missedVersion = featureTimelineLayout({
    ...building,
    events: [
      ...building.events,
      ...versionDeliveryEvents(
        [{ ...record('3', 'not-met'), archiveUrl: url }],
        new Set([taskKey(reference)])
      )
    ]
  })
  expect(missedVersion.deliveries[0]?.event.label).toContain('目标未达成')
  expect(missedVersion.deliveries[0]?.event.url).toBe(url)
  expect(missedVersion.slots[3]?.state).not.toBe('done')
  expect(missedVersion.slots[3]?.hint).toContain('目标未达成')
  const unknownOrder = featureTimelineLayout({
    ...building,
    events: [...building.events, ...incomplete]
  })
  expect(unknownOrder.deliveries[0]?.event.label).toContain('顺序未确认')
  expect(unknownOrder.slots[3]?.state).not.toBe('done')
  const pendingAcceptance = featureTimelineLayout({
    ...building,
    archives: [{ ...intentEvent, phase: 'version', version: '4', at: '' }]
  })
  expect(pendingAcceptance.deliveries[0]?.event.url).toBe(url)
  expect(Number.isFinite(pendingAcceptance.deliveries[0]?.offset)).toBe(true)
  expect(pendingAcceptance.slots[3]?.state).not.toBe('done')
})
