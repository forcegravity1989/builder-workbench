import { expect, it } from 'vitest'
import { sdlcProviderOf } from '../overview-sdlc'
import {
  eventsFromPulls,
  featureNumber,
  linkedPullNumbers,
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
  expect(pullPhase('', `设计 PR：${url}`, url)).toBe('design')
  expect(pullPhase('交付阶段：开发', `设计 PR：${url}`, url)).toBe('unknown')
  expect(pullPhase('changed intent.md, spec.md')).toBe('unknown')
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
  const events = eventsFromPulls([pull])
  expect(events.map((event) => event.phase)).toEqual(['design', 'design'])
  expect(eventsFromPulls([pull], '2026-10-01T09:00:00Z')).toHaveLength(1)
  expect(eventsFromPulls([{ ...pull, createdAt: undefined, mergedAt: undefined }])).toEqual([])
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
    events: [{ ...events[0]!, phase: 'intent' as const, at: '2026-10-01T07:00:00Z' }, ...deliveries]
  } as Parameters<typeof featureTimeline>[0]
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
    archives: [{ ...events[0]!, phase: 'intent', at: '' }]
  })
  expect(unlocated.points.intent).toBeUndefined()
  expect(unlocated.sources.find((source) => source.id === 'Plan')?.events[0]?.url).toBe(url)
  const maintenanceFeature = {
    ...timelineFeature,
    observedAt: '2026-10-10T12:00:00Z',
    events: [
      {
        ...events[0]!,
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
        ...events[0]!,
        id: 'plan5',
        phase: 'intent' as const,
        version: '5',
        at: '2026-10-05T08:00:00Z'
      },
      {
        ...events[0]!,
        id: 'plan6',
        phase: 'intent' as const,
        version: '6',
        at: '2026-10-06T08:00:00Z'
      },
      {
        ...events[0]!,
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
      { ...events[0]!, id: 'plan8', phase: 'intent', version: '8', at: '2026-10-07T09:00:00Z' }
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
        ...events[0]!,
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
    archives: [{ ...events[0]!, phase: 'version', version: '4', at: '' }]
  })
  expect(pendingAcceptance.deliveries[0]?.event.url).toBe(url)
  expect(Number.isFinite(pendingAcceptance.deliveries[0]?.offset)).toBe(true)
  expect(pendingAcceptance.slots[3]?.state).not.toBe('done')
})
