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
import {
  versionDeliveryEvents,
  type OverviewVersionPlan,
  type VersionEvidence
} from './version-evidence'
import { featureHistoryScopes } from './feature-history-scope'
import type { CycleTaskSnapshot } from '../version-cycle/ports'
import { cycleBaseline, featureTimeline, featureStage } from './feature-timeline'
import { featureTimelineLayout } from './feature-timeline-layout'
import { OverviewPullSchema } from '../../../../shared/workbench/overview-pull'
import { materialSourceInputs } from './material-cache'
import {
  matchMilestoneFeature,
  milestoneMaterialFacts,
  milestoneIssueFacts,
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
  const root440 = { ...reference, number: 440 }
  const child = { ...reference, number: 501 }
  const removed = { ...reference, number: 502 }
  const foreign = { ...reference, repository: 'https://github.com/acme/other.git', number: 503 }
  const childSnapshot: CycleTaskSnapshot & { kind: 'ready' } = {
    kind: 'ready',
    reference: child,
    iid: child.number,
    title: '【特性#440】执行',
    state: 'closed',
    url: 'https://github.com/acme/app/issues/501',
    readAt: metadata.readAt,
    source: { kind: 'task-source', provider: 'github', projectId: 'project', hostId: 'local' }
  }
  const past: OverviewVersionPlan = {
    version: 'v0.7',
    tasks: [child],
    goals: [],
    source: 'committed',
    taskSnapshot: [childSnapshot, { ...childSnapshot, reference: removed, iid: removed.number }]
  }
  const currentPlan: OverviewVersionPlan = {
    version: 'v0.8',
    tasks: [reference, root440, child],
    goals: [],
    source: 'committed'
  }
  const currentReads = new Map([
    [taskKey(reference), { ...childSnapshot, reference, iid: 334, labels: ['特性'] }],
    [taskKey(root440), { ...childSnapshot, reference: root440, iid: 440, labels: ['特性'] }],
    [taskKey(child), { ...childSnapshot, title: '【特性#334】执行' }]
  ])
  const fixedHistory = featureHistoryScopes(
    [past, currentPlan],
    [reference, root440],
    'v0.8',
    currentReads
  )
  expect(fixedHistory.scopes.get(taskKey(reference))?.byVersion.has('v0.7')).toBe(false)
  expect([...fixedHistory.scopes.get(taskKey(root440))!.byVersion.get('v0.7')!]).toEqual([
    taskKey(child)
  ])
  expect(fixedHistory.candidates).toEqual([])
  const noLiveChild = new Map(currentReads)
  noLiveChild.delete(taskKey(child))
  expect(featureHistoryScopes([past], [root440], 'v0.8', noLiveChild).candidates).toEqual([child])
  expect(featureHistoryScopes([past], [reference], 'v0.8', noLiveChild).candidates).toEqual([])
  const legacy = { ...past, taskSnapshot: undefined, tasks: [removed, foreign] }
  const unresolved = featureHistoryScopes([legacy], [reference], 'v0.8', noLiveChild)
  expect(unresolved.candidates).toEqual([removed])
  expect(unresolved.scopes.get(taskKey(reference))).toEqual({
    byVersion: new Map(),
    complete: false
  })
  expect(
    featureHistoryScopes(
      [{ ...legacy, source: 'draft' }],
      [reference],
      'v0.8',
      noLiveChild
    ).scopes.get(taskKey(reference))?.complete
  ).toBe(true)
  const laterPlan: OverviewVersionPlan = {
    ...legacy,
    version: 'v0.9',
    confirmation: {
      id: 'later-plan',
      phase: 'intent',
      label: '计划合入',
      at: '2026-11-02T09:00:00Z',
      url,
      readAt: metadata.readAt,
      rule: 'test'
    }
  }
  const cutoffScope = featureHistoryScopes(
    [laterPlan],
    [reference],
    'v0.8',
    noLiveChild,
    '2026-10-30T17:00:00Z'
  )
  expect(cutoffScope.candidates).toEqual([])
  expect(cutoffScope.scopes.get(taskKey(reference))?.complete).toBe(true)
  expect([
    ...featureHistoryScopes([past], [root440], 'v0.7', currentReads)
      .scopes.get(taskKey(root440))!
      .byVersion.get('v0.7')!
  ]).toEqual([taskKey(child)])
  const discovered = new Map(noLiveChild)
  discovered.set(taskKey(removed), {
    ...childSnapshot,
    reference: removed,
    iid: removed.number,
    title: '【特性#334】执行'
  })
  const related = featureHistoryScopes([legacy], [reference], 'v0.8', discovered)
  expect(related.scopes.get(taskKey(reference))?.complete).toBe(true)
  expect([...related.scopes.get(taskKey(reference))!.byVersion.get('v0.7')!]).toEqual([
    taskKey(removed)
  ])
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
  const goalFeature = {
    ...timelineFeature,
    root: { ...timelineFeature.root, title: '【v0.8|目标】项目墙', labels: ['特性'] }
  }
  const facts: MilestoneVersionFacts = {
    plan: {
      version: 'v0.8',
      cycleId: 'cycle-eight',
      timeWindow: { start: '2026-10-01', end: '2026-10-10' },
      goals: [{ goalId: 'g2', title: '目标', metricTargets: [] }],
      tasks: [reference]
    },
    formalPlan: true,
    acceptance: null,
    features: [goalFeature],
    loading: false,
    failed: false,
    stale: false
  }
  const delivery = {
    id: 'delivery',
    version: { version: 'v0.8', cycleId: 'cycle-eight' },
    stages: [{ phase: 'Test' as const, start: '2026-10-29T00:00', end: '2026-10-30T12:00' }]
  }
  const plannedMaintenance = {
    ...delivery,
    id: 'later',
    version: { version: 'v0.9', cycleId: 'cycle-nine' },
    stages: [{ phase: 'Maintain' as const, start: '2026-11-02T00:00', end: '2026-11-06T12:00' }]
  }
  const material: MilestoneMaterial = {
    schema_version: 2,
    months: [{ month: '2026-10', outcome: '' }],
    features: [
      {
        id: 'planned',
        month: '2026-10',
        title: ' 项目墙 ',
        owner: 'builder',
        deliveries: [delivery, plannedMaintenance]
      }
    ]
  }
  const otherFeature = {
    ...goalFeature,
    root: { ...goalFeature.root, reference: { ...reference, number: 440 }, iid: 440 }
  }
  const duplicateFacts = {
    ...facts,
    plan: { ...facts.plan!, tasks: [reference, otherFeature.root.reference] },
    features: [goalFeature, otherFeature]
  }
  expect(matchMilestoneFeature(delivery, facts, material)).toBe(goalFeature)
  for (const invalid of [
    { ...facts, plan: { ...facts.plan!, cycleId: 'different' } },
    { ...facts, plan: { ...facts.plan!, tasks: [] } },
    { ...facts, failed: true },
    {
      ...facts,
      features: [{ ...goalFeature, root: { ...goalFeature.root, labels: ['特性扩展'] } }]
    },
    duplicateFacts,
    {
      ...duplicateFacts,
      features: [
        goalFeature,
        { ...otherFeature, root: { ...otherFeature.root, title: '别的特性' } }
      ]
    }
  ]) {
    expect(matchMilestoneFeature(delivery, invalid, material)).toBeUndefined()
  }
  const plannedHours = milestoneStageHours(material, facts, goalFeature)
  expect(plannedHours).toEqual({ Test: 36, Maintain: 108 })
  const duplicateMaterial = {
    ...material,
    features: [...material.features, { ...material.features[0]!, id: 'another' }]
  }
  expect(milestoneStageHours(duplicateMaterial, facts, goalFeature)).toEqual({})
  const accepted = (outcome: 'met' | 'not-met' | 'pending') => record('4', outcome).acceptance
  const versionFacts = (
    version: string,
    cycleId: string,
    start: string,
    end: string,
    outcome: 'met' | 'not-met'
  ): MilestoneVersionFacts => ({
    ...facts,
    plan: { ...facts.plan!, version, cycleId, timeWindow: { start, end } },
    acceptance: accepted(outcome)
  })
  const first = versionFacts('v0.8', 'cycle-eight', '2026-10-01', '2026-10-10', 'not-met')
  const second = versionFacts('v0.9', 'cycle-nine', '2026-10-07', '2026-10-11', 'met')
  const third = versionFacts('v0.10', 'cycle-ten', '2027-01-05', '2027-01-09', 'not-met')
  const projection = (...reads: MilestoneVersionFacts[]) =>
    Object.fromEntries(reads.map((read) => [milestoneVersionKey(read.plan ?? read.version!), read]))
  const actualLayout = (...reads: MilestoneVersionFacts[]) =>
    milestoneActualLayout(material.features[0]!, material, projection(...reads))
  const labels = (...reads: MilestoneVersionFacts[]) =>
    actualLayout(...reads).results.map((result) => result.label)
  const actual = actualLayout(first, second, third)
  expect(actual.results.map((result) => result.label)).toEqual(['未上线', '已上线', '维护未完成'])
  expect(actual).toMatchObject({ lanes: 2, results: [{ lane: 0 }, { lane: 1 }, { lane: 0 }] })
  expect(actual.results[0]?.version.timeWindow?.end).toBe('2026-10-10')
  expect(
    milestoneActualCalendar({ material, versions: [] }, projection(first, second, third)).end
  ).toBeGreaterThanOrEqual(milestoneDay('2027-01-09'))
  expect(
    labels(first, { ...second, plan: { ...second.plan!, timeWindow: undefined } }, third)
  ).toEqual(['未上线', '维护未完成'])
  for (const acceptance of [null, accepted('pending')]) {
    expect(actualLayout({ ...facts, acceptance }).results).toEqual([])
  }
  const firstMet = { ...first, acceptance: accepted('met') }
  const secondNotMet = { ...second, acceptance: accepted('not-met') }
  const pendingFirst = { ...facts, loading: true, features: [] }
  const unresolvedFirst: MilestoneVersionFacts[] = [
    { ...firstMet, failed: true, features: [] },
    pendingFirst,
    facts,
    { ...pendingFirst, version: delivery.version, plan: null, formalPlan: false }
  ]
  for (const unresolved of unresolvedFirst) {
    expect(actualLayout(unresolved, secondNotMet)).toMatchObject({
      results: [],
      note: '前序版本结果未确认'
    })
  }
  expect(labels(unresolvedFirst[0]!, second, third)).toEqual(['维护未完成'])
  const failedSecond = { ...second, failed: true, features: [] }
  expect(labels(firstMet, failedSecond, third)).toEqual(['已上线', '维护未完成'])
  expect(
    labels(
      { ...unresolvedFirst[0]!, plan: { ...facts.plan!, tasks: [{ ...reference, number: 999 }] } },
      secondNotMet
    )
  ).toEqual(['未上线'])
  // A single-version candidate must survive an unrelated goal's identity read failure.
  for (const goalId of ['g2', 'unrelated']) {
    const failedReference = { ...reference, number: 999, goalId }
    const partial = {
      ...firstMet,
      plan: {
        ...facts.plan!,
        goals: [...facts.plan!.goals, { ...facts.plan!.goals[0]!, goalId: 'unrelated' }],
        tasks: [reference, failedReference]
      },
      failed: true,
      identityFailures: [failedReference]
    }
    expect(labels(partial)).toEqual(goalId === 'g2' ? [] : ['已上线'])
    expect(labels(partial, secondNotMet)).toEqual(goalId === 'g2' ? [] : ['已上线', '维护未完成'])
  }
  const taskSnapshot = [{ kind: 'ready' as const, ...goalFeature.root }]
  const snapshotAcceptance = { ...accepted('met'), taskSnapshot }
  const unavailableIssue = {
    kind: 'unavailable' as const,
    reference,
    readAt: '2026-10-12T00:00:00Z',
    error: 'unavailable'
  }
  const archivedIdentity = milestoneIssueFacts(facts.plan, snapshotAcceptance, [unavailableIssue])
  for (const snapshots of [taskSnapshot, taskSnapshot.concat(taskSnapshot)]) {
    const read = { ...snapshotAcceptance, taskSnapshot: snapshots }
    expect(milestoneIssueFacts(facts.plan, read, [unavailableIssue]).failed).toBe(
      snapshots.length > 1
    )
  }
  expect(
    labels({ ...facts, ...archivedIdentity, acceptance: snapshotAcceptance }, secondNotMet)
  ).toEqual(['已上线', '维护未完成'])
  const renamedIdentity = milestoneIssueFacts(facts.plan, snapshotAcceptance, [
    {
      kind: 'ready',
      reference,
      task: { ...goalFeature.root, title: '【v0.9】新项目墙', labels: [] }
    }
  ])
  const renamedMaterial = {
    ...material,
    features: [{ ...material.features[0]!, title: '新项目墙' }]
  }
  expect(
    matchMilestoneFeature(delivery, { ...facts, ...renamedIdentity }, renamedMaterial)?.root
      .reference
  ).toEqual(reference)
  const fixedPlan = {
    ...facts.plan!,
    schema_version: 3 as const,
    summary: { progress: '', risks: '' }
  }
  const fixed = {
    kind: 'committed' as const,
    version: fixedPlan.version,
    cycleId: fixedPlan.cycleId,
    sourceCommit: 'commit',
    revision: 'revision'
  }
  const committed = {
    kind: 'ready' as const,
    source: 'committed' as const,
    sourceCommit: 'commit',
    revision: 'revision'
  }
  const archived = {
    plan: { ...committed, document: fixedPlan },
    acceptance: {
      ...committed,
      document: {
        schema_version: 3 as const,
        version: fixed.version,
        cycleId: fixed.cycleId,
        planRef: fixed,
        preparedArtifacts: [],
        ...accepted('met')
      }
    },
    prStatuses: {
      plan: null,
      acceptance: {
        state: 'merged' as const,
        checkedAt: '2026-10-11T08:00:00Z',
        mergedAt: '2026-10-11T08:00:00Z'
      }
    }
  }
  expect(milestoneMaterialFacts(archived).acceptance).toBe(archived.acceptance.document)
  expect(
    milestoneMaterialFacts({
      ...archived,
      plan: { ...archived.plan, document: { ...fixedPlan, goals: [], tasks: [] } }
    })
  ).toMatchObject({ formalPlan: false, acceptance: null })
  for (const unverified of [
    { ...archived, acceptance: { ...archived.acceptance, source: 'draft' as const } },
    { ...archived, prStatuses: { plan: null, acceptance: null } },
    { ...archived, plan: { ...archived.plan, revision: 'changed' } }
  ]) {
    expect(milestoneMaterialFacts(unverified).acceptance).toBeNull()
  }

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
