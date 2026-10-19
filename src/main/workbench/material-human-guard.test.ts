import { expect, it } from 'vitest'
import type { AcceptanceMaterial, PlanningMaterial } from '../../shared/workbench/version-material'
import { AcceptanceMaterialSchema } from '../../shared/workbench/version-material'
import {
  acceptanceGoalSnapshot,
  acceptanceRoundState
} from '../../shared/workbench/acceptance-rounds'
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
const frozenSource = { sourceCommit: 'b'.repeat(40), sourceRevision: revision }
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
  const addedGoal = { ...base.results[0], goalId: 'g2' }
  const expanded = structuredClone(withOpenRound)
  expanded.results.push({
    ...addedGoal,
    rounds: [{ ...round, snapshot: acceptanceGoalSnapshot(addedGoal) }]
  })
  expect(acceptanceRoundState(expanded).kind).toBe('ready')
  expect(humanFieldChanges(withOpenRound, expanded)).toEqual([])
  const firstEdit = structuredClone(expanded)
  firstEdit.results[1].progress = '用户首次填写进展'
  expect(humanFieldChanges(withOpenRound, firstEdit)).toEqual(['results[g2].progress'])
  const wrongWeek = structuredClone(expanded)
  wrongWeek.results[1].rounds![0].week = '2026-W40'
  expect(humanFieldChanges(withOpenRound, wrongWeek)).toContain('results[].rounds')
  const copiedDecision = structuredClone(expanded)
  copiedDecision.results[1].decision = decision
  copiedDecision.results[1].rounds![0].snapshot = acceptanceGoalSnapshot(copiedDecision.results[1])
  expect(humanFieldChanges(withOpenRound, copiedDecision)).toContain('results[g2].decision')
  const copiedSnapshot = structuredClone(expanded)
  copiedSnapshot.results[1].rounds![0].snapshot = round.snapshot
  expect(humanFieldChanges(withOpenRound, copiedSnapshot)).toContain('results[g2].rounds[round-1]')
  expect(
    humanFieldChanges(withOpenRound, {
      ...withOpenRound,
      results: [
        {
          ...withOpenRound.results[0],
          rounds: [{ ...round, ...frozenSource, closedAt: '2026-10-02T00:00:00Z' }, nextRound]
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
  const finished = withDecision(withOpenRound)
  finished.workflow = {
    stage: 'archive',
    updatedAt: '2026-10-01T00:00:00Z',
    archivePr: { provider: 'github', repository: 'org/repo', number: 42 }
  }
  finished.results[0].progress = '本周完成，保留人工进展'
  finished.results[0].meetingDirectives = [confirmedDirective]
  const rolled = structuredClone(finished)
  delete rolled.workflow
  delete rolled.results[0].decision
  rolled.results[0].rounds = [
    {
      ...round,
      ...frozenSource,
      closedAt: '2026-10-02T00:00:00Z',
      snapshot: acceptanceGoalSnapshot(finished.results[0])
    },
    { ...nextRound, snapshot: acceptanceGoalSnapshot(finished.results[0], true) }
  ]
  expect(AcceptanceMaterialSchema.safeParse(rolled).success).toBe(true)
  expect(humanFieldChanges(finished, rolled)).toEqual([])
  expect(humanFieldChanges(finished, { ...rolled, workflow: finished.workflow })).toContain(
    'results[].rounds'
  )
  expect(
    humanFieldChanges(finished, {
      ...rolled,
      workflow: { stage: 'preparation', updatedAt: '2026-10-02T00:00:00Z' }
    })
  ).toContain('results[].rounds')
  const inheritedDecision = structuredClone(rolled)
  inheritedDecision.results[0].decision = decision
  expect(humanFieldChanges(finished, inheritedDecision)).toContain('results[].rounds')
  const fabricatedClosure = structuredClone(rolled)
  fabricatedClosure.results[0].rounds![0].snapshot.goals[0].progress = '不是人工原文'
  expect(humanFieldChanges(finished, fabricatedClosure)).toContain('results[g1].rounds[round-1]')
  const changedHistory = structuredClone(rolled)
  changedHistory.results[0].rounds![0].snapshot.goals[0].progress = '改写已封存'
  expect(humanFieldChanges(rolled, changedHistory)).toContain('results[g1].rounds[round-1]')
  const asymmetric = structuredClone(rolled)
  asymmetric.results.push({
    ...base.results[0],
    goalId: 'g2',
    rounds: [{ ...nextRound, id: 'g2-round' }]
  })
  expect(acceptanceRoundState(asymmetric).kind).toBe('conflict')
  expect(
    acceptanceRoundState({ ...asymmetric, results: asymmetric.results.toReversed() }).kind
  ).toBe('conflict')
  expect(humanFieldChanges(rolled, asymmetric)).toContain('results[].rounds')
  expect(humanFieldChanges(asymmetric, asymmetric)).toEqual([])
  const repaired = structuredClone(asymmetric)
  for (const result of repaired.results) {
    result.rounds = result.rounds?.map((entry) =>
      entry.closedAt
        ? entry
        : {
            ...entry,
            id: 'round-2',
            snapshot: acceptanceGoalSnapshot(result)
          }
    )
  }
  expect(acceptanceRoundState(repaired).kind).toBe('ready')
  expect(humanFieldChanges(asymmetric, repaired)).toEqual([])
  const relabeled = structuredClone(repaired)
  for (const result of relabeled.results) {
    result.rounds = result.rounds?.map((entry) =>
      entry.closedAt ? entry : { ...entry, week: '2026-W41' }
    )
  }
  expect(humanFieldChanges(asymmetric, relabeled)).toContain('results[].rounds')
  const halfReference = structuredClone(rolled)
  delete halfReference.results[0].rounds![0].sourceRevision
  expect(AcceptanceMaterialSchema.safeParse(halfReference).success).toBe(false)
  expect(acceptanceRoundState(base).kind).toBe('legacy')
})

it('refuses model-channel saves that write a decision, including creates', async () => {
  const stored = withDecision(material())
  await expect(
    assertHumanFieldsUntouched(async () => null, acceptanceSave(stored), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
  const frozen = withDecision(material())
  frozen.planRef = {
    kind: 'committed',
    version: 'v1',
    cycleId: 'cycle',
    revision,
    sourceCommit: 'c'.repeat(40)
  }
  frozen.results[0].progress = '完整保存的人工进展'
  frozen.results[0].meetingDirectives = [confirmedDirective]
  const next = structuredClone(frozen)
  delete next.results[0].decision
  next.results[0].rounds = [
    {
      ...round,
      ...frozenSource,
      closedAt: '2026-10-02T00:00:00Z',
      snapshot: acceptanceGoalSnapshot(frozen.results[0])
    },
    {
      ...round,
      id: 'round-2',
      week: '2026-W40',
      snapshot: acceptanceGoalSnapshot(frozen.results[0], true)
    }
  ]
  const readFrozen = async () => ({ document: frozen })
  const readSource = async () => ({
    document: frozen,
    revision,
    sourceCommit: frozenSource.sourceCommit
  })
  await expect(
    assertHumanFieldsUntouched(readFrozen, acceptanceSave(next), {}, readSource)
  ).resolves.toBeUndefined()
  const closedOnly = structuredClone(frozen)
  closedOnly.workflow = {
    stage: 'archive',
    updatedAt: '2026-10-01T00:00:00Z',
    archivePr: { provider: 'github', repository: 'org/repo', number: 42 }
  }
  closedOnly.results[0].rounds = [{ ...round, closedAt: '2026-10-01T00:00:00Z' }]
  const reopened = structuredClone(closedOnly)
  delete reopened.workflow
  delete reopened.results[0].decision
  reopened.results[0].rounds!.push({
    ...round,
    id: 'round-2',
    week: '2026-W40',
    snapshot: acceptanceGoalSnapshot(closedOnly.results[0], true)
  })
  expect(humanFieldChanges(closedOnly, reopened)).toEqual([])
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: closedOnly }),
      acceptanceSave(reopened),
      {},
      async (input) => {
        expect(input.sourceCommit).toBeUndefined()
        expect(input.expectedRevision).toBeUndefined()
        expect(input.source).toBe('cycle')
        return { document: closedOnly, revision, sourceCommit: frozenSource.sourceCommit }
      }
    )
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(async () => ({ document: closedOnly }), acceptanceSave(reopened), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: closedOnly }),
      acceptanceSave(reopened),
      {},
      readSource
    )
  ).rejects.toMatchObject({ code: 'forbidden' })
  expect(humanFieldChanges(closedOnly, { ...reopened, workflow: closedOnly.workflow })).toContain(
    'results[].rounds'
  )
  const inheritedClosedDecision = structuredClone(reopened)
  inheritedClosedDecision.results[0].decision = decision
  expect(humanFieldChanges(closedOnly, inheritedClosedDecision)).toContain('results[].rounds')
  const rewritesClosed = structuredClone(reopened)
  rewritesClosed.results[0].rounds![0].sourceCommit = frozenSource.sourceCommit
  rewritesClosed.results[0].rounds![0].sourceRevision = frozenSource.sourceRevision
  expect(humanFieldChanges(closedOnly, rewritesClosed)).toContain('results[g1].rounds[round-1]')
  const draftFrozen = structuredClone(frozen)
  draftFrozen.planRef = material().planRef
  const draftNext = { ...next, planRef: draftFrozen.planRef }
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: draftFrozen }),
      acceptanceSave(draftNext),
      {},
      async () => ({
        document: draftFrozen,
        revision,
        sourceCommit: frozenSource.sourceCommit
      })
    )
  ).rejects.toMatchObject({ code: 'forbidden' })
  await expect(
    assertHumanFieldsUntouched(readFrozen, acceptanceSave(next), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
  await expect(
    assertHumanFieldsUntouched(readFrozen, acceptanceSave(next), {}, async () => ({
      document: material(),
      revision,
      sourceCommit: frozenSource.sourceCommit
    }))
  ).rejects.toMatchObject({ code: 'forbidden' })
  const changedClosed = structuredClone(next)
  changedClosed.results[0].rounds![0].snapshot.issueNotes = { forged: '不能修改历史' }
  await expect(
    assertHumanFieldsUntouched(async () => ({ document: next }), acceptanceSave(changedClosed), {
      clientKind: 'runtime'
    })
  ).rejects.toMatchObject({ code: 'forbidden' })
  await expect(
    assertHumanFieldsUntouched(async () => ({ document: stored }), acceptanceSave(stored), {})
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: material() }),
      acceptanceSave({
        ...material(),
        results: material().results.map((item) => ({
          ...item,
          meetingDirectives: [
            {
              ...pendingDirective,
              source: 'manual' as const,
              sourceRef: 'conversation:session-1/message-2'
            }
          ]
        }))
      }),
      {}
    )
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

it('allows human input while retaining round integrity on both workflows', async () => {
  const read = async (): Promise<never> => {
    throw new Error('human channels must not trigger the guard read')
  }
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: material() }),
      acceptanceSave(withDecision(material())),
      {
        clientKind: 'runtime'
      }
    )
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: material() }),
      acceptanceSave(withDecision(material())),
      {
        clientKind: 'mobile'
      }
    )
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
