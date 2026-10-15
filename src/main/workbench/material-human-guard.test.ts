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

it('classifies the CLI socket as the model channel and authenticated UI sockets as human channels', () => {
  expect(isModelSaveChannel({})).toBe(true)
  expect(isModelSaveChannel({ clientKind: 'runtime' })).toBe(false)
  expect(isModelSaveChannel({ clientKind: 'mobile' })).toBe(false)
})

it('names every human-only field the incoming document would add, change or drop', () => {
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
  await expect(
    assertHumanFieldsUntouched(readStored, planSave(), {})
  ).rejects.toMatchObject({ code: 'forbidden' })
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
