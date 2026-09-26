import { describe, expect, it } from 'vitest'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import {
  artifactCandidateCheck,
  assertFixedPlan,
  createAcceptanceMaterial
} from './acceptance-model'
import {
  decisionFreshness,
  goalEvidenceRevision,
  recordHumanDecision,
  preparationEvidenceRevision
} from './acceptance-decision'
import { archiveSignal, decisionSignal, preparationSignal } from './acceptance-journey'
import type { ArchiveStatus } from '../../../../shared/workbench/version-archive'

const plan: PlanningMaterial = {
  schema_version: 3,
  version: 'v0.5',
  cycleId: 'plan-run-1',
  summary: { progress: '', risks: '' },
  goals: ['g1', 'g2'].map((goalId) => ({ goalId, title: goalId, metricTargets: [] })),
  tasks: []
}
const planSnapshot = { document: plan, revision: `sha256:${'a'.repeat(64)}` }
function draft() {
  const document = createAcceptanceMaterial({
    plan: planSnapshot,
    cycleId: 'acceptance-run-1',
    planRef: {
      kind: 'committed',
      version: plan.version,
      cycleId: plan.cycleId,
      revision: planSnapshot.revision,
      sourceCommit: '1'.repeat(40)
    }
  })
  document.candidateRef = {
    repository: 'github.com/acme/project',
    version: plan.version,
    commit: '2'.repeat(40)
  }
  return document
}
async function decide() {
  return recordHumanDecision({
    document: draft(),
    plan,
    goalId: 'g1',
    outcome: 'met',
    source: '用户在验收屏确认',
    reason: '展示通过',
    recordedAt: '2026-09-25T10:00:00Z'
  })
}

describe('version acceptance evidence', () => {
  it('invalidates readiness only when prepared material changes', async () => {
    const document = draft()
    const revision = await preparationEvidenceRevision(document)
    document.results[0].note = '讨论记录'
    expect(await preparationEvidenceRevision(document)).toBe(revision)
    document.results[0].deliveries.push({ title: '新报告', location: 'report.md' })
    expect(await preparationEvidenceRevision(document)).not.toBe(revision)
  })
  it('keeps a failed human outcome red when its report is archived, and unproven merges stay pending', async () => {
    const document = await recordHumanDecision({
      document: draft(),
      plan,
      goalId: 'g1',
      outcome: 'not-met',
      source: '验收界面',
      reason: '交付缺口',
      recordedAt: '2026-09-25T01:00:00Z'
    })
    const material = {
      workflow: 'acceptance' as const,
      version: document.version,
      cycleId: document.cycleId,
      revision: planSnapshot.revision
    }
    const reference = {
      provider: 'github',
      repository: 'github.com/acme/project',
      number: 1,
      materialRevision: material.revision
    }
    const status: ArchiveStatus = {
      kind: 'merged',
      reference,
      url: 'https://github.com/acme/project/pull/1',
      checkedAt: '2026-09-25T01:00:00Z',
      checks: 'passed',
      review: 'approved',
      mergeCommit: '4'.repeat(40),
      proof: {
        kind: 'verified',
        value: {
          reference,
          mergeCommit: '4'.repeat(40),
          material,
          checkedAt: '2026-09-25T01:00:00Z'
        }
      }
    }
    expect(decisionSignal(document, plan, { g1: 'current', g2: 'unrecorded' }).kind).toBe('failed')
    expect(archiveSignal(status, material).kind).toBe('complete')
    expect(decisionSignal(document, plan, { g1: 'changed', g2: 'unrecorded' }).kind).toBe('pending')
    expect(document.results.find((item) => item.goalId === 'g1')?.decision?.outcome).toBe('not-met')
    expect(
      archiveSignal({ ...status, proof: { kind: 'unknown', reason: '合入文件未读回' } }, material)
        .kind
    ).toBe('pending')
  })

  it('requires human preparation review while keeping machine mismatches visible', () => {
    const document = draft()
    const verified = { kind: 'verified' as const, checkedAt: '2026-09-25T01:00:00Z' }
    const candidate = { ...verified, candidate: document.candidateRef! }
    expect(preparationSignal(undefined, verified, null).kind).toBe('unknown')
    expect(preparationSignal(document, verified, { candidate, artifacts: [] }).kind).toBe('pending')
    document.preparedArtifacts = [
      {
        artifactId: 'demo',
        kind: 'showcase',
        location: 'demo.html',
        candidateRef: document.candidateRef!,
        generatedAt: verified.checkedAt
      }
    ]
    const artifact = {
      artifactId: 'demo',
      candidate: verified,
      availability: verified,
      execution: { kind: 'unknown' as const, reason: '未核对执行记录' }
    }
    expect(preparationSignal(document, verified, { candidate, artifacts: [artifact] }).kind).toBe(
      'pending'
    )
    expect(
      preparationSignal(document, verified, {
        candidate,
        artifacts: [{ ...artifact, execution: verified }]
      }).kind
    ).toBe('pending')
    expect(
      preparationSignal(document, verified, { candidate, artifacts: [artifact] }, true).kind
    ).toBe('complete')
    document.candidateRef = { ...document.candidateRef!, commit: '5'.repeat(40) }
    expect(preparationSignal(document, verified, null).kind).toBe('failed')
  })
  it('starts a separate cycle while retaining fixed plan identity and promises', () => {
    const document = draft()
    expect(document.cycleId).not.toBe(plan.cycleId)
    expect(document.planRef.cycleId).toBe(plan.cycleId)
    expect(document.results.every((result) => !result.decision)).toBe(true)
    expect(() =>
      assertFixedPlan(document.planRef, { ...planSnapshot, revision: `sha256:${'b'.repeat(64)}` })
    ).toThrow('来源已改变')
  })

  it('keeps goal one current when only goal two receives evidence', async () => {
    const document = await decide()
    document.results.find((result) => result.goalId === 'g2')!.note = '补充验收报告'
    expect(await decisionFreshness(document, plan, 'g1')).toBe('current')
    document.results
      .find((result) => result.goalId === 'g1')!
      .deliveries.push({ title: '新的交付', location: 'report.html' })
    expect(await decisionFreshness(document, plan, 'g1')).toBe('changed')
    expect(document.results.find((result) => result.goalId === 'g1')!.decision!.outcome).toBe('met')
  })

  it('rechecks every goal when a candidate package changes even with the same source commit', async () => {
    const original = draft()
    original.preparedArtifacts = [
      {
        artifactId: 'release',
        kind: 'package',
        location: 'release.zip',
        candidateRef: original.candidateRef!,
        generatedAt: '2026-09-25T01:00:00Z',
        checksum: 'sha256:first'
      }
    ]
    const first = await recordHumanDecision({
      document: original,
      plan,
      goalId: 'g1',
      outcome: 'met',
      source: '验收界面',
      reason: '已展示',
      recordedAt: '2026-09-25T02:00:00Z'
    })
    const second = await recordHumanDecision({
      document: first,
      plan,
      goalId: 'g2',
      outcome: 'met',
      source: '验收界面',
      reason: '已展示',
      recordedAt: '2026-09-25T02:00:00Z'
    })
    expect(second.results.every((result) => !result.deliveries.length)).toBe(true)
    const changed = structuredClone(second)
    changed.preparedArtifacts[0].checksum = 'sha256:replacement'
    expect(changed.candidateRef).toEqual(second.candidateRef)
    for (const goalId of ['g1', 'g2']) {
      expect(await decisionFreshness(second, plan, goalId)).toBe('current')
      expect(await decisionFreshness(changed, plan, goalId)).toBe('changed')
      expect(changed.results.find((result) => result.goalId === goalId)?.decision?.outcome).toBe(
        'met'
      )
    }
  })

  it('invalidates prior evidence after either candidate or fixed plan changes', async () => {
    const original = await decide()
    const changedCandidate = structuredClone(original)
    changedCandidate.candidateRef!.commit = '3'.repeat(40)
    expect(await decisionFreshness(changedCandidate, plan, 'g1')).toBe('changed')
    const changedPlan = structuredClone(original)
    changedPlan.planRef.revision = `sha256:${'b'.repeat(64)}`
    expect(await decisionFreshness(changedPlan, plan, 'g1')).toBe('changed')
  })

  it('binds only artifacts cited by this goal and does not hash the decision itself', async () => {
    const document = draft()
    const result = document.results[0]
    result.deliveries = [{ title: '演示', location: 'demo.html' }]
    document.preparedArtifacts = [
      {
        artifactId: 'demo',
        kind: 'showcase',
        candidateRef: document.candidateRef!,
        location: 'demo.html',
        generatedAt: '2026-09-25T10:00:00Z'
      }
    ]
    const before = await goalEvidenceRevision(document, plan, 'g1')
    result.decision = {
      outcome: 'met',
      source: 'human',
      recordedAt: '2026-09-25T10:01:00Z',
      materialRevision: before,
      reason: '通过'
    }
    expect(await goalEvidenceRevision(document, plan, 'g1')).toBe(before)
    document.preparedArtifacts.push({
      ...document.preparedArtifacts[0],
      artifactId: 'unrelated',
      location: 'other.html'
    })
    expect(await goalEvidenceRevision(document, plan, 'g1')).toBe(before)
    document.preparedArtifacts[0].checksum = 'changed'
    expect(await goalEvidenceRevision(document, plan, 'g1')).not.toBe(before)
  })

  it('never treats matching artifact declarations as verified execution', () => {
    const document = draft()
    const artifact = {
      artifactId: 'a',
      kind: 'package' as const,
      candidateRef: document.candidateRef!,
      location: 'build.zip',
      generatedAt: '2026-09-25T10:00:00Z'
    }
    expect(artifactCandidateCheck(artifact, document.candidateRef).kind).toBe('unknown')
    expect(
      artifactCandidateCheck(artifact, { ...document.candidateRef!, commit: '3'.repeat(40) }).kind
    ).toBe('mismatch')
  })
})
