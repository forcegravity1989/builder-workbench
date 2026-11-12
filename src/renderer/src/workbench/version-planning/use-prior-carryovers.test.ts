import { expect, it } from 'vitest'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import { derivePriorCarryovers } from './use-prior-carryovers'

const revision = `sha256:${'a'.repeat(64)}`
const reference = (number: number, goalId: string) => ({
  provider: 'github',
  repository: 'github.com/acme/app',
  number,
  goalId
})

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
    results: [{ goalId: 'g1', readings: [], note: '', nextStep: '' }],
    ...overrides
  }
}

it('maps carry marks and confirmed minutes followups to the two prior-review rows', () => {
  // Absent optional fields read as empty rows — no inference, no free-text parsing.
  // issueMarksRecorded=false is the Unknown signal: the acceptance never marked,
  // so the prior row must not assert "no carryover" (iron rule).
  expect(derivePriorCarryovers(acceptance())).toEqual({
    issues: [],
    directives: [],
    issueMarksRecorded: false,
    openReadbackReferences: []
  })

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
        readings: [],
        note: '#331、#339 遗留 open',
        nextStep: '',
        issueMarks: {
          // Full-identity key joins the snapshot; legacy bare-number key joins
          // when unambiguous; both surface with titles only when joined.
          'github:github.com/acme/app:331': { carry: true },
          '339': { carry: true },
          'github:github.com/acme/app:999': { carry: true }
        }
      },
      {
        goalId: 'g2',
        readings: [],
        note: '',
        nextStep: '',
        issueMarks: { 'github:github.com/acme/app:341': { carry: true } }
      }
    ],
    minutes: {
      consensus: ['共识：G1 演示通过'],
      followups: [
        { id: 'f1', text: '纳入下版的事项' },
        { id: 'f2', text: '第二条纳入下版' }
      ],
      confirmed: true,
      confirmedAt: '2026-10-19T00:00:00Z'
    }
  })
  const carryovers = derivePriorCarryovers(document)
  expect(carryovers.issues.map((item) => [item.number, item.title])).toEqual([
    [331, '遗留任务标题'],
    [339, null],
    [341, null],
    [999, null]
  ])
  expect(carryovers.issues.map((item) => item.key)).toEqual([
    'github:github.com/acme/app:331',
    '339',
    'github:github.com/acme/app:341',
    'github:github.com/acme/app:999'
  ])
  expect(carryovers.issues[0]?.task?.title).toBe('遗留任务标题')
  expect(carryovers.issues[1]?.task).toBeNull()
  expect(carryovers.directives).toEqual([
    { label: 'M1', text: '纳入下版的事项' },
    { label: 'M2', text: '第二条纳入下版' }
  ])
  // Positive branch of the Unknown gate: marks present → recorded; the frozen
  // snapshot references ride along for the live readback row.
  expect(carryovers.issueMarksRecorded).toBe(true)
  expect(carryovers.openReadbackReferences.map((ref) => ref.number)).toEqual([331])
  const closedSnapshot = {
    ...document,
    taskSnapshot: document.taskSnapshot!.map((item) =>
      item.kind === 'ready' ? { ...item, state: 'closed' } : item
    )
  }
  // Frozen closed facts exclude a mark from carryover; missing facts do not erase human marks.
  expect(derivePriorCarryovers(closedSnapshot).issues.map((item) => item.number)).toEqual([
    339, 341, 999
  ])
  expect(closedSnapshot.results[0]?.issueMarks?.['github:github.com/acme/app:331']?.carry).toBe(
    true
  )
})

it('reads no meeting carryover from an unconfirmed minutes draft', () => {
  const followups = [{ id: 'f1', text: '未确认的草稿不流入下版' }]
  // An unconfirmed section is not a meeting outcome: a draft the assistant wrote
  // must not become the next plan's 会议遗留 before a human confirms it.
  expect(
    derivePriorCarryovers(acceptance({ minutes: { consensus: [], followups, confirmed: false } }))
      .directives
  ).toEqual([])
  // Confirming is what releases them, in stored order with positional labels.
  expect(
    derivePriorCarryovers(
      acceptance({
        minutes: {
          consensus: [],
          followups: [...followups, { id: 'f2', text: '第二条' }],
          confirmed: true,
          confirmedAt: '2026-10-19T00:00:00Z'
        }
      })
    ).directives
  ).toEqual([
    { label: 'M1', text: '未确认的草稿不流入下版' },
    { label: 'M2', text: '第二条' }
  ])

  // Pre-v10 material has no minutes section: its human-confirmed
  // 「纳入下周计划」 directives are the same meeting outcome, so an older version
  // keeps feeding the row instead of reading empty after the retirement.
  const legacy = acceptance({
    results: [
      {
        goalId: 'g1',
        readings: [],
        note: '',
        nextStep: '',
        meetingDirectives: [
          {
            id: 'd1',
            text: '旧格式里已确认纳入下版',
            tag: 'next-week-plan',
            status: 'confirmed',
            source: 'transcript-summary',
            sourceRef: 'meeting-1',
            confirmedAt: '2026-10-02T01:00:00Z'
          },
          {
            id: 'd2',
            text: '未确认的不显示',
            tag: 'next-week-plan',
            status: 'pending',
            source: 'manual',
            sourceRef: 'conversation:x'
          },
          {
            id: 'd3',
            text: '其他标签不显示',
            tag: 'record-remaining',
            status: 'confirmed',
            source: 'manual',
            sourceRef: 'conversation:y',
            confirmedAt: '2026-10-02T01:00:00Z'
          }
        ]
      }
    ]
  })
  expect(derivePriorCarryovers(legacy).directives).toEqual([
    { label: 'M1', text: '旧格式里已确认纳入下版' }
  ])
  // Once the version has confirmed minutes, the minutes win over the legacy list.
  expect(
    derivePriorCarryovers({
      ...legacy,
      minutes: {
        consensus: [],
        followups: [{ id: 'f1', text: '纪要里的遗留' }],
        confirmed: true,
        confirmedAt: '2026-10-19T00:00:00Z'
      }
    }).directives
  ).toEqual([{ label: 'M1', text: '纪要里的遗留' }])
})
