import { expect, it } from 'vitest'
import type { AcceptanceMaterial, PlanningMaterial } from '../../shared/workbench/version-material'
import {
  VersionMaterialReadSchema,
  type VersionMaterialSave
} from '../../shared/workbench/version-material-request'
import { WorkspaceScopeError } from './workspace-scope-error'
import {
  assertHumanFieldsUntouched,
  humanFieldChanges,
  isModelSaveChannel,
  planHumanFieldChanges
} from './material-human-guard'

const revision = `sha256:${'a'.repeat(64)}`
const decision = {
  outcome: 'met' as const,
  source: '验收界面',
  recordedAt: '2026-09-25T00:00:00Z',
  materialRevision: revision,
  reason: '人工确认达成'
}
const pendingDirective = {
  id: 'directive-1',
  text: '补齐材料链接',
  tag: 'record-remaining' as const,
  status: 'pending' as const,
  source: 'transcript-summary' as const,
  sourceRef: 'issue-374#summary'
}
const confirmedDirective = {
  ...pendingDirective,
  text: '确认下周继续跟进',
  status: 'confirmed' as const,
  confirmedAt: '2026-09-25T01:00:00Z'
}
const round = {
  id: 'round-1',
  week: '2026-W39',
  kind: 'progress' as const,
  snapshot: {
    goals: [{ goalId: 'g1', decision: 'pending', progress: '进行中' }],
    issueMarks: { issue1: { carry: true } },
    issueNotes: { issue1: '下周继续核对' }
  }
}
function material(overrides: Partial<AcceptanceMaterial> = {}): AcceptanceMaterial {
  return {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    planRef: {
      kind: 'draft',
      version: 'v1',
      cycleId: 'cycle',
      revision,
      sourceWorktreeId: 'tree',
      sourceHostId: 'local'
    },
    preparedArtifacts: [],
    results: [{ goalId: 'g1', deliveries: [], readings: [], note: '', nextStep: '' }],
    ...overrides
  }
}
function acceptanceSave(doc: AcceptanceMaterial): VersionMaterialSave {
  return {
    repoId: 'repo',
    worktreeId: 'tree',
    hostId: 'local',
    workflow: 'acceptance',
    version: 'v1',
    expectedRevision: null,
    document: doc
  }
}
function planMaterial(risks = ''): PlanningMaterial {
  return {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    summary: { progress: '', risks },
    goals: [],
    tasks: []
  }
}
function planSave(risks = ''): VersionMaterialSave {
  return {
    repoId: 'repo',
    worktreeId: 'tree',
    hostId: 'local',
    workflow: 'plan',
    version: 'v1',
    expectedRevision: null,
    document: planMaterial(risks)
  }
}
function withDecision(doc: AcceptanceMaterial): AcceptanceMaterial {
  return {
    ...doc,
    results: doc.results.map((item) => (item.goalId === 'g1' ? { ...item, decision } : item))
  }
}

it('names every human-only field the incoming document would add, change or drop', () => {
  expect(isModelSaveChannel({})).toBe(true)
  expect(isModelSaveChannel({ clientKind: 'runtime' })).toBe(false)
  expect(isModelSaveChannel({ clientKind: 'mobile' })).toBe(false)
  const base = material()
  expect(humanFieldChanges(base, base)).toEqual([])
  expect(humanFieldChanges(null, base)).toEqual([])
  expect(humanFieldChanges(base, withDecision(base))).toEqual(['results[g1].decision'])
  expect(humanFieldChanges(withDecision(base), base)).toEqual(['results[g1].decision'])
  expect(humanFieldChanges(withDecision(base), withDecision(base))).toEqual([])
  expect(
    humanFieldChanges(withDecision(base), {
      ...withDecision(base),
      results: withDecision(base).results.map((item) => ({
        ...item,
        decision: { ...decision, outcome: 'not-met' as const }
      }))
    })
  ).toEqual(['results[g1].decision'])
  expect(
    humanFieldChanges(null, {
      ...base,
      preparationReview: {
        source: 'ui',
        recordedAt: '2026-09-25T00:00:00Z',
        materialRevision: revision
      }
    })
  ).toEqual(['preparationReview'])
  // Dropping the whole result row also drops the recorded decision.
  expect(humanFieldChanges(withDecision(base), { ...base, results: [] })).toEqual([
    'results[g1].decision'
  ])
  const withOpenRound = material({
    results: [
      {
        ...base.results[0],
        progress: '进行中',
        issueMarks: { issue1: { carry: true } },
        issueNotes: { issue1: '下周继续核对' },
        rounds: [round]
      }
    ]
  })
  const nextRound = {
    ...round,
    id: 'round-2',
    week: '2026-W40'
  }
  expect(
    humanFieldChanges(withOpenRound, {
      ...withOpenRound,
      results: [
        {
          ...withOpenRound.results[0],
          rounds: [{ ...round, closedAt: '2026-10-02T00:00:00Z' }, nextRound]
        }
      ]
    })
  ).not.toContain('results[g1].rounds[round-2]')
  expect(
    humanFieldChanges(withOpenRound, {
      ...withOpenRound,
      results: [{ ...withOpenRound.results[0], rounds: [round, nextRound] }]
    })
  ).toContain('results[g1].rounds[round-2]')
  const secondNewRound = { ...nextRound, id: 'round-3', week: '2026-W41' }
  expect(
    humanFieldChanges(withOpenRound, {
      ...withOpenRound,
      results: [
        {
          ...withOpenRound.results[0],
          rounds: [{ ...round, closedAt: '2026-10-02T00:00:00Z' }, nextRound, secondNewRound]
        }
      ]
    })
  ).toContain('results[g1].rounds')
})

it('refuses model-channel saves that write a decision, including creates', async () => {
  const stored = withDecision(material())
  await expect(
    assertHumanFieldsUntouched(async () => null, acceptanceSave(stored), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
  await expect(
    assertHumanFieldsUntouched(async () => ({ document: stored }), acceptanceSave(stored), {})
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: stored }),
      acceptanceSave({
        ...stored,
        results: stored.results.map((item) => ({
          ...item,
          decision: { ...decision, outcome: 'not-met' as const }
        }))
      }),
      {}
    )
  ).rejects.toBeInstanceOf(WorkspaceScopeError)

  const humanFields = material({
    results: [
      {
        ...material().results[0],
        deliveries: [{ title: '已交付', location: '/tmp/delivery' }],
        progress: '已完成联调',
        nextStep: '下周复核',
        issueNotes: { issue1: '需要补证据' },
        issueMarks: { issue1: { risk: true } },
        rounds: [round],
        meetingDirectives: [confirmedDirective]
      }
    ]
  })
  const readHumanFields = async () => ({ document: humanFields })
  await expect(
    assertHumanFieldsUntouched(
      readHumanFields,
      acceptanceSave({
        ...humanFields,
        results: humanFields.results.map((item) => ({ ...item, progress: '模型改写' }))
      }),
      {}
    )
  ).rejects.toMatchObject({ code: 'forbidden' })
  expect(
    humanFieldChanges(humanFields, {
      ...humanFields,
      results: humanFields.results.map((item) => ({
        ...item,
        deliveries: [],
        nextStep: '',
        issueNotes: {},
        issueMarks: {},
        rounds: [],
        meetingDirectives: []
      }))
    })
  ).toEqual(
    expect.arrayContaining([
      'results[g1].actualDelivery',
      'results[g1].nextStep',
      'results[g1].issueNotes',
      'results[g1].issueMarks',
      'results[g1].rounds[round-1]',
      'results[g1].meetingDirectives[directive-1]'
    ])
  )
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: material() }),
      acceptanceSave({
        ...material(),
        results: material().results.map((item) => ({
          ...item,
          meetingDirectives: [pendingDirective]
        }))
      }),
      {}
    )
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: material() }),
      acceptanceSave({
        ...material(),
        results: material().results.map((item) => ({
          ...item,
          meetingDirectives: [{ ...pendingDirective, source: 'manual' as const }]
        }))
      }),
      {}
    )
  ).rejects.toMatchObject({ code: 'forbidden' })
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: material() }),
      acceptanceSave({
        ...material(),
        results: material().results.map((item) => ({
          ...item,
          rounds: [
            {
              ...round,
              snapshot: {
                ...round.snapshot,
                goals: [{ goalId: 'g1', decision: 'met', progress: '模型伪造' }]
              }
            }
          ]
        }))
      }),
      {}
    )
  ).rejects.toMatchObject({ code: 'forbidden' })
  await expect(
    assertHumanFieldsUntouched(
      readHumanFields,
      acceptanceSave({
        ...humanFields,
        results: humanFields.results.map((item) => ({
          ...item,
          meetingDirectives: [{ ...confirmedDirective, text: '模型改写的指导' }]
        }))
      }),
      {}
    )
  ).rejects.toMatchObject({ code: 'forbidden' })
})

it('leaves human channels untouched on both workflows', async () => {
  const read = async (): Promise<never> => {
    throw new Error('human channels must not trigger the guard read')
  }
  await expect(
    assertHumanFieldsUntouched(read, acceptanceSave(withDecision(material())), {
      clientKind: 'runtime'
    })
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(read, acceptanceSave(withDecision(material())), {
      clientKind: 'mobile'
    })
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(read, planSave('用户填写的风险'), { clientKind: 'runtime' })
  ).resolves.toBeUndefined()
})

it('guards the plan risk report on the model channel', async () => {
  // Creating a plan with empty risks is fine; pre-filling risks is not.
  await expect(
    assertHumanFieldsUntouched(async () => null, planSave(), {})
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(async () => null, planSave('模型代填的风险'), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
  // Round-tripping the user's risks unchanged passes; editing or dropping them fails.
  const stored = planMaterial('用户填写的风险')
  const readStored = async () => ({ document: stored })
  await expect(
    assertHumanFieldsUntouched(readStored, planSave('用户填写的风险'), {})
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(readStored, planSave('模型改写的风险'), {})
  ).rejects.toBeInstanceOf(WorkspaceScopeError)
  await expect(assertHumanFieldsUntouched(readStored, planSave(), {})).rejects.toMatchObject({
    code: 'forbidden'
  })
  expect(planHumanFieldChanges(null, planMaterial())).toEqual([])
  expect(planHumanFieldChanges(stored, planMaterial())).toEqual(['summary.risks'])
})

it('feeds the guard read a payload the strict ReadSchema accepts', async () => {
  const seen: unknown[] = []
  const read = async (input: unknown) => {
    seen.push(input)
    VersionMaterialReadSchema.parse(input)
    return { document: material() }
  }
  await expect(
    assertHumanFieldsUntouched(read, acceptanceSave(material()), {})
  ).resolves.toBeUndefined()
  expect(seen).toEqual([
    { repoId: 'repo', worktreeId: 'tree', hostId: 'local', workflow: 'acceptance', version: 'v1' }
  ])
})
