import { expect, it } from 'vitest'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { derivePriorCarryovers } from './use-prior-carryovers'

const revision = `sha256:${'a'.repeat(64)}`
const reference = (number: number, goalId: string) => ({
  provider: 'github',
  repository: 'github.com/acme/app',
  number,
  goalId
})

function plan(): PlanningMaterial {
  return {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    summary: { progress: '', risks: '' },
    goals: [
      { goalId: 'g1', title: '目标一', metricTargets: [] },
      { goalId: 'g2', title: '目标二', metricTargets: [] }
    ],
    tasks: [reference(331, 'g1'), reference(339, 'g1'), reference(341, 'g2')]
  }
}

function acceptance(overrides: Partial<AcceptanceMaterial> = {}): AcceptanceMaterial {
  return {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    planRef: {
      kind: 'committed',
      version: 'v1',
      cycleId: 'cycle',
      revision,
      sourceCommit: 'b'.repeat(40)
    },
    preparedArtifacts: [],
    results: [{ goalId: 'g1', deliveries: [], readings: [], note: '', nextStep: '' }],
    ...overrides
  }
}

it('maps carry marks and confirmed next-week directives to the two prior-review rows', () => {
  // Absent optional fields read as empty rows — no inference, no free-text parsing.
  expect(derivePriorCarryovers(acceptance(), plan())).toEqual({ issues: [], directives: [] })

  const document = acceptance({
    taskSnapshot: [
      {
        kind: 'ready',
        reference: reference(331, 'g1'),
        source: {
          kind: 'task-source',
          provider: 'github',
          projectId: 'acme/app',
          hostId: 'local',
          repoId: 'repo',
          providerIdentity: { provider: 'github', owner: 'acme', repo: 'app', host: 'github.com' }
        },
        iid: 331,
        title: '遗留任务标题',
        state: 'OPEN',
        url: 'https://github.com/acme/app/issues/331',
        readAt: '2026-10-20T00:00:00Z'
      }
    ],
    results: [
      {
        goalId: 'g1',
        deliveries: [],
        readings: [],
        note: '#331、#339 遗留 open',
        nextStep: '',
        issueMarks: {
          // Full-identity key joins the snapshot; legacy bare-number key joins
          // when unambiguous; both surface with titles only when joined.
          'github:github.com/acme/app:331': { carry: true },
          '339': { carry: true },
          'github:github.com/acme/app:999': { carry: true }
        },
        meetingDirectives: [
          {
            id: 'd1',
            text: '纳入下版的事项',
            tag: 'next-week-plan',
            status: 'confirmed',
            source: 'manual',
            sourceRef: 'conversation:x',
            confirmedAt: '2026-10-19T00:00:00Z'
          },
          {
            id: 'd2',
            text: '未确认的不显示',
            tag: 'next-week-plan',
            status: 'pending',
            source: 'manual',
            sourceRef: 'conversation:y'
          },
          {
            id: 'd3',
            text: '其他标签不显示',
            tag: 'record-remaining',
            status: 'confirmed',
            source: 'manual',
            sourceRef: 'conversation:z',
            confirmedAt: '2026-10-19T00:00:00Z'
          }
        ]
      },
      {
        goalId: 'g2',
        deliveries: [],
        readings: [],
        note: '',
        nextStep: '',
        issueMarks: { 'github:github.com/acme/app:341': { carry: true, risk: true } },
        meetingDirectives: [
          {
            id: 'd4',
            text: '第二条纳入下版',
            tag: 'next-week-plan',
            status: 'confirmed',
            source: 'transcript-summary',
            sourceRef: 'meeting-1',
            confirmedAt: '2026-10-19T01:00:00Z'
          }
        ]
      }
    ]
  })
  const carryovers = derivePriorCarryovers(document, plan())
  expect(carryovers.issues.map((item) => [item.number, item.title])).toEqual([
    [331, '遗留任务标题'],
    [339, null],
    // A mark with no plan-side reference for the goal is not associated and stays out.
    [341, null]
  ])
  expect(carryovers.issues.map((item) => item.key)).toEqual([
    'github:github.com/acme/app:331',
    'github:github.com/acme/app:339',
    'github:github.com/acme/app:341'
  ])
  expect(carryovers.issues[0]?.task?.title).toBe('遗留任务标题')
  expect(carryovers.issues[1]?.task).toBeNull()
  expect(carryovers.directives).toEqual([
    { label: 'M1', text: '纳入下版的事项' },
    { label: 'M2', text: '第二条纳入下版' }
  ])
})
