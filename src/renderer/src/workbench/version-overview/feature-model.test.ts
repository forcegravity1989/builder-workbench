import { expect, it } from 'vitest'
import {
  eventsFromPulls,
  featureNumber,
  featureStage,
  linkedPullNumbers,
  pullPhase,
  taskKey,
  referenceForPlan,
  timelineClusters,
  timelineRange,
  type FeaturePull
} from './feature-model'
import { versionDeliveryEvents, type VersionEvidence } from './version-evidence'
import { cycleBaseline, featureTimeline } from './feature-timeline'

it('projects scoped feature evidence without turning missing, later or unrelated records into delivery', () => {
  const reference = {
    provider: 'github',
    repository: 'https://github.com/acme/app.git',
    number: 334,
    goalId: 'g2'
  }
  const url = 'https://github.com/acme/app/pull/459'
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
  expect(timelineRange(events)?.duration).toBe(2 * 3600000)
  expect(timelineRange(events)?.position(Date.parse('2026-10-01T09:00:00Z'))).toBe(50)
  expect(
    timelineClusters(
      Array.from({ length: 6 }, (_, i) => ({ ...events[0]!, id: String(i) })),
      760
    )[0]?.events
  ).toHaveLength(6)
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
  expect(deliveries[3]?.label).toContain('首次交付（Pre）')
  expect(deliveries[4]?.label).toContain('后续交付（Release）')
  expect(featureStage([pull], false, deliveries)).toContain('Release')
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
  const timeline = featureTimeline(timelineFeature)
  expect(timeline.points.design?.at).toBe(pull.mergedAt)
  expect(
    featureTimeline({ ...timelineFeature, problems: ['PR 读取失败'] }).points.design
  ).toBeUndefined()
  expect(timeline.points.pre?.at).toBe(record('4', 'met').at)
  expect(timeline.points.release?.at).toBe(record('5', 'met').at)
  expect(timeline.segments.find((segment) => segment.id === 'design')?.duration).toBe(3 * 3600000)
  expect(timeline.segments.find((segment) => segment.id === 'pre')?.duration).toBeNull()
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
  ).toBe('pre')
  const unlocated = featureTimeline({
    ...timelineFeature,
    events: [],
    pulls: [],
    archives: [{ ...events[0]!, phase: 'intent', at: '' }]
  })
  expect(unlocated.points.intent).toBeUndefined()
  expect(unlocated.sources.find((source) => source.id === 'intent')?.events[0]?.url).toBe(url)
})
