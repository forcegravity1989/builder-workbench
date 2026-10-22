import { expect, it } from 'vitest'
import type {
  AcceptanceMaterial,
  AcceptanceMeetingMinutes,
  PlanMeetingMinutes,
  PlanningMaterial
} from '../../shared/workbench/version-material'
import {
  VersionMaterialReadSchema,
  type VersionMaterialSave
} from '../../shared/workbench/version-material-request'
import { WorkspaceScopeError } from './workspace-scope-error'
import { assertHumanFieldsUntouched, isModelSaveChannel } from './material-human-guard'
import { acceptanceHumanFieldChanges } from './acceptance-human-guard'
import { planHumanFieldChanges } from './plan-human-guard'

const revision = `sha256:${'a'.repeat(64)}`
const decision = {
  outcome: 'met' as const,
  source: '验收界面人工确认',
  recordedAt: '2026-09-25T00:00:00Z',
  materialRevision: revision,
  reason: '人工确认达成'
}
function material(overrides: Partial<AcceptanceMaterial> = {}): AcceptanceMaterial {
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

it('names every human-only acceptance field the incoming document would change', () => {
  expect(isModelSaveChannel({})).toBe(true)
  expect(isModelSaveChannel({ clientKind: 'runtime' })).toBe(false)
  expect(isModelSaveChannel({ clientKind: 'mobile' })).toBe(false)
  const base = material()
  expect(acceptanceHumanFieldChanges(base, base)).toEqual([])
  expect(acceptanceHumanFieldChanges(null, base)).toEqual([])
  expect(acceptanceHumanFieldChanges(base, withDecision(base))).toEqual(['results[g1].decision'])
  expect(acceptanceHumanFieldChanges(withDecision(base), base)).toEqual(['results[g1].decision'])
  expect(acceptanceHumanFieldChanges(withDecision(base), withDecision(base))).toEqual([])
  expect(
    acceptanceHumanFieldChanges(withDecision(base), {
      ...withDecision(base),
      results: withDecision(base).results.map((item) => ({
        ...item,
        decision: { ...decision, outcome: 'not-met' as const }
      }))
    })
  ).toEqual(['results[g1].decision'])
  expect(
    acceptanceHumanFieldChanges(null, {
      ...base,
      preparationReview: {
        source: 'ui',
        recordedAt: '2026-09-25T00:00:00Z',
        materialRevision: revision
      }
    })
  ).toEqual(['preparationReview'])
  // Dropping the whole result row also drops the recorded decision.
  expect(acceptanceHumanFieldChanges(withDecision(base), { ...base, results: [] })).toEqual([
    'results[g1].decision'
  ])
  // Issue notes and the carry mark are human fields; a model-created result may
  // still carry the empty values schema3 requires.
  const annotated = material({
    results: [
      {
        ...base.results[0],
        nextStep: '下周复核',
        issueNotes: { issue1: '需要补证据' },
        issueMarks: { issue1: { carry: true } }
      }
    ]
  })
  expect(
    acceptanceHumanFieldChanges(annotated, {
      ...annotated,
      results: [{ ...annotated.results[0], nextStep: '', issueNotes: {}, issueMarks: {} }]
    })
  ).toEqual([
    'results[g1].nextStep',
    'results[g1].issueNotes',
    'results[g1].issueMarks'
  ])
  // Pre-v10 fields are read-only history: the model channel may round-trip them
  // unchanged but may not rewrite them — and "cleaning them up" is refused too,
  // because converting a stored file is a session migration with human consent.
  const legacyDoc = material({
    results: [
      {
        ...base.results[0],
        progress: '旧进展',
        deliveries: [{ title: '旧交付件', location: 'demo.html' }],
        meetingDirectives: [
          {
            id: 'd1',
            text: '旧指导',
            tag: 'next-week-plan',
            status: 'confirmed',
            source: 'manual',
            sourceRef: 'conversation:x',
            confirmedAt: '2026-10-01T00:00:00Z'
          }
        ],
        issueMarks: { issue1: { carry: true, risk: true } }
      }
    ]
  })
  expect(acceptanceHumanFieldChanges(legacyDoc, legacyDoc)).toEqual([])
  expect(
    acceptanceHumanFieldChanges(legacyDoc, {
      ...legacyDoc,
      results: [{ goalId: 'g1', readings: [], note: '', nextStep: '' }]
    })
  ).toEqual(
    expect.arrayContaining([
      'results[g1].progress(旧格式只读)',
      'results[g1].deliveries(旧格式只读)',
      'results[g1].meetingDirectives(旧格式只读)',
      'results[g1].issueMarks.risk(旧格式只读)'
    ])
  )
})

it('refuses model-channel saves that write an acceptance verdict', async () => {
  const stored = withDecision(material())
  await expect(
    assertHumanFieldsUntouched(async () => null, acceptanceSave(stored), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
  // Round-tripping the stored verdict unchanged is allowed.
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
  // Human channels never trigger the guard read.
  await expect(
    assertHumanFieldsUntouched(
      async (): Promise<never> => {
        throw new Error('human channels must not trigger the guard read')
      },
      acceptanceSave(withDecision(material())),
      { clientKind: 'runtime' }
    )
  ).resolves.toBeUndefined()
  // The draft pre-acceptance channel is retired: the model may not create or
  // repoint acceptance material at an uncommitted plan, which would walk around
  // the empty-board hard gate from the CLI side.
  const draftBased = material({
    planRef: {
      kind: 'draft',
      version: 'v1',
      cycleId: 'cycle',
      revision,
      sourceWorktreeId: 'tree',
      sourceHostId: 'local'
    }
  })
  expect(acceptanceHumanFieldChanges(null, draftBased)).toEqual([
    'planRef.kind(须为已提交计划)'
  ])
  await expect(
    assertHumanFieldsUntouched(async () => null, acceptanceSave(draftBased), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
})

function acceptanceMinutes(
  overrides: Partial<AcceptanceMeetingMinutes> = {}
): AcceptanceMeetingMinutes {
  return {
    consensus: ['共识：G1 演示通过'],
    followups: [{ id: 'f1', text: '第 4 个项目数据下周一才能读回' }],
    confirmed: false,
    ...overrides
  }
}
function acceptanceDocWithMinutes(minutes: AcceptanceMeetingMinutes): AcceptanceMaterial {
  return { ...material(), minutes }
}

it('guards the acceptance meeting minutes on the model channel', async () => {
  // Creating the section unconfirmed passes; creating it confirmed does not.
  await expect(
    assertHumanFieldsUntouched(
      async () => null,
      acceptanceSave(acceptanceDocWithMinutes(acceptanceMinutes())),
      {}
    )
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(
      async () => null,
      acceptanceSave(
        acceptanceDocWithMinutes(
          acceptanceMinutes({ confirmed: true, confirmedAt: '2026-10-22T10:00:00+08:00' })
        )
      ),
      {}
    )
  ).rejects.toMatchObject({ code: 'forbidden' })

  // A confirmed section is frozen: an identical round-trip passes, any rewrite fails.
  const confirmed = acceptanceMinutes({
    confirmed: true,
    confirmedAt: '2026-10-22T10:00:00+08:00'
  })
  const confirmedDoc = acceptanceDocWithMinutes(confirmed)
  const readConfirmed = async () => ({ document: confirmedDoc })
  await expect(
    assertHumanFieldsUntouched(readConfirmed, acceptanceSave(confirmedDoc), {})
  ).resolves.toBeUndefined()
  const editedBody = acceptanceDocWithMinutes({ ...confirmed, consensus: ['模型改写的共识'] })
  expect(acceptanceHumanFieldChanges(confirmedDoc, editedBody)).toEqual(['minutes.confirmed'])
  await expect(
    assertHumanFieldsUntouched(readConfirmed, acceptanceSave(editedBody), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
  // Revoking the confirmation is itself a human decision, so the model channel
  // may not do it either — the UI does, on the human channel.
  const revoked = acceptanceDocWithMinutes({ ...confirmed, confirmed: false })
  expect(acceptanceHumanFieldChanges(confirmedDoc, revoked)).toEqual(['minutes.confirmed'])

  // While unconfirmed the model may rewrite the body and append followups.
  const openDoc = acceptanceDocWithMinutes(acceptanceMinutes())
  const drafted = acceptanceDocWithMinutes(
    acceptanceMinutes({
      consensus: ['模型整理后的共识'],
      followups: [
        { id: 'f1', text: '第 4 个项目数据下周一才能读回' },
        { id: 'f2', text: '报告格式规范另立' }
      ],
      sources: '板面批注 2 条 · 会议转写稿(meeting-123)',
      updatedAt: '2026-10-22T11:00:00+08:00'
    })
  )
  expect(acceptanceHumanFieldChanges(openDoc, drafted)).toEqual([])
  await expect(
    assertHumanFieldsUntouched(async () => ({ document: openDoc }), acceptanceSave(drafted), {})
  ).resolves.toBeUndefined()
  // Odd legacy shape (unconfirmed but carrying a timestamp): dropping the human
  // confirmation timestamp is refused like any human mark.
  const stamped = acceptanceDocWithMinutes(
    acceptanceMinutes({ confirmed: false, confirmedAt: '2026-10-20T09:00:00+08:00' })
  )
  const stampDropped = acceptanceDocWithMinutes(acceptanceMinutes({ confirmed: false }))
  expect(acceptanceHumanFieldChanges(stamped, stampDropped)).toEqual(['minutes.confirmedAt'])
  await expect(
    assertHumanFieldsUntouched(
      async () => ({ document: stamped }),
      acceptanceSave(stampDropped),
      {}
    )
  ).rejects.toMatchObject({ code: 'forbidden' })
})

function planMinutes(overrides: Partial<PlanMeetingMinutes> = {}): PlanMeetingMinutes {
  return {
    consensus: ['共识：G1 指标梳理周五前完成'],
    followups: [{ id: 'f1', text: '补齐指标定义口径', closed: false }],
    confirmed: false,
    ...overrides
  }
}
function planDocWithMinutes(minutes: PlanMeetingMinutes): PlanningMaterial {
  return { ...planMaterial(), minutes }
}
function planSaveDoc(document: PlanningMaterial): VersionMaterialSave {
  return {
    repoId: 'repo',
    worktreeId: 'tree',
    hostId: 'local',
    workflow: 'plan',
    version: 'v1',
    expectedRevision: null,
    document
  }
}

it('guards the plan risk report and meeting minutes on the model channel', async () => {
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
  await expect(
    assertHumanFieldsUntouched(
      async (): Promise<never> => {
        throw new Error('human channels must not trigger the guard read')
      },
      planSave('用户填写的风险'),
      { clientKind: 'runtime' }
    )
  ).resolves.toBeUndefined()

  // Confirmed minutes freeze entirely; identical round-trips still pass.
  const confirmedMinutes = planMinutes({
    confirmed: true,
    confirmedAt: '2026-10-21T10:00:00+08:00',
    followups: [{ id: 'f1', text: '补齐指标定义口径', closed: true }]
  })
  const confirmedDoc = planDocWithMinutes(confirmedMinutes)
  const readConfirmed = async () => ({ document: confirmedDoc })
  await expect(
    assertHumanFieldsUntouched(readConfirmed, planSaveDoc(confirmedDoc), {})
  ).resolves.toBeUndefined()
  const editedBody = planDocWithMinutes({ ...confirmedMinutes, consensus: ['模型改写的共识'] })
  expect(planHumanFieldChanges(confirmedDoc, editedBody)).toEqual(['minutes.confirmed'])
  await expect(
    assertHumanFieldsUntouched(readConfirmed, planSaveDoc(editedBody), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
  const revoked = planDocWithMinutes({ ...confirmedMinutes, confirmed: false })
  expect(planHumanFieldChanges(confirmedDoc, revoked)).toEqual(['minutes.confirmed'])

  // Unconfirmed section: closed marks round-trip by id; flipping, adding
  // pre-closed entries or dropping closed ones is refused.
  const openStored = planDocWithMinutes(
    planMinutes({
      followups: [
        { id: 'f1', text: '补齐指标定义口径', closed: true },
        { id: 'f2', text: '核对遗留 Issue', closed: false }
      ]
    })
  )
  const flip = planDocWithMinutes(
    planMinutes({
      followups: [
        { id: 'f1', text: '补齐指标定义口径', closed: false },
        { id: 'f2', text: '核对遗留 Issue', closed: false }
      ]
    })
  )
  expect(planHumanFieldChanges(openStored, flip)).toEqual(['minutes.followups[f1].closed'])
  const preClosedNew = planDocWithMinutes(
    planMinutes({
      followups: [
        { id: 'f1', text: '补齐指标定义口径', closed: true },
        { id: 'f2', text: '核对遗留 Issue', closed: false },
        { id: 'f3', text: '新增即闭环', closed: true }
      ]
    })
  )
  expect(planHumanFieldChanges(openStored, preClosedNew)).toEqual(['minutes.followups[f3].closed'])
  const dropClosed = planDocWithMinutes(
    planMinutes({ followups: [{ id: 'f2', text: '核对遗留 Issue', closed: false }] })
  )
  expect(planHumanFieldChanges(openStored, dropClosed)).toEqual(['minutes.followups[f1].closed'])
  await expect(
    assertHumanFieldsUntouched(async () => ({ document: openStored }), planSaveDoc(flip), {})
  ).rejects.toMatchObject({ code: 'forbidden' })

  await expect(
    assertHumanFieldsUntouched(async () => null, planSaveDoc(planDocWithMinutes(planMinutes())), {})
  ).resolves.toBeUndefined()
  await expect(
    assertHumanFieldsUntouched(
      async () => null,
      planSaveDoc(
        planDocWithMinutes(
          planMinutes({ confirmed: true, confirmedAt: '2026-10-21T10:00:00+08:00' })
        )
      ),
      {}
    )
  ).rejects.toMatchObject({ code: 'forbidden' })
  const drafted = planDocWithMinutes(
    planMinutes({
      consensus: ['模型整理后的共识'],
      followups: [
        { id: 'f1', text: '补齐指标定义口径', closed: true },
        { id: 'f2', text: '新增遗留', closed: false }
      ],
      sources: '在线批注 2 条 · 会议转写稿(meeting-123)',
      updatedAt: '2026-10-21T11:00:00+08:00'
    })
  )
  expect(planHumanFieldChanges(openStored, drafted)).toEqual([])
  await expect(
    assertHumanFieldsUntouched(async () => ({ document: openStored }), planSaveDoc(drafted), {})
  ).resolves.toBeUndefined()
  const stamped = planDocWithMinutes(
    planMinutes({ confirmed: false, confirmedAt: '2026-10-20T09:00:00+08:00' })
  )
  const stampDropped = planDocWithMinutes(planMinutes({ confirmed: false }))
  expect(planHumanFieldChanges(stamped, stampDropped)).toEqual(['minutes.confirmedAt'])
  await expect(
    assertHumanFieldsUntouched(async () => ({ document: stamped }), planSaveDoc(stampDropped), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
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
