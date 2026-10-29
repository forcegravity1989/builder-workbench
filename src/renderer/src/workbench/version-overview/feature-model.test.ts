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
import {
  humanAcceptanceTime,
  versionDeliveryEvents,
  type VersionEvidence
} from './version-evidence'

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
  expect(humanAcceptanceTime(record('1').acceptance, ['g2'])).toBeUndefined()
  expect(humanAcceptanceTime(record('1', 'pending').acceptance, ['g2'])).toBeUndefined()
  expect(humanAcceptanceTime(record('1', 'met').acceptance, ['g2'])).toBe(pull.readAt)
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
})
