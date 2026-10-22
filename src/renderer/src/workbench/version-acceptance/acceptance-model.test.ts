import { describe, expect, it } from 'vitest'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import {
  assertFixedPlan,
  createAcceptanceMaterial,
  emptyGoalResult,
  latestVerificationArtifact,
  sameAcceptanceSource
} from './acceptance-model'
import { goalEvidenceRevision, recordHumanDecision } from './acceptance-decision'

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

describe('version acceptance evidence', () => {
  it('starts a separate cycle while retaining fixed plan identity and promises', () => {
    const document = draft()
    expect(document.cycleId).not.toBe(plan.cycleId)
    expect(document.planRef.cycleId).toBe(plan.cycleId)
    expect(document.results.every((result) => !result.decision)).toBe(true)
    // Rounds are retired with the cross-week scenario: one version, one acceptance.
    const other = structuredClone(document)
    other.cycleId = 'acceptance-run-2'
    expect(sameAcceptanceSource(document, other)).toBe(false)
    const reordered = structuredClone(document)
    reordered.results = reordered.results.toReversed()
    expect(sameAcceptanceSource(document, reordered)).toBe(true)
    expect(emptyGoalResult('g3')).toEqual({ goalId: 'g3', readings: [], note: '', nextStep: '' })
    expect(
      sameAcceptanceSource(document, {
        ...document,
        results: [...document.results, emptyGoalResult('g3')]
      })
    ).toBe(true)
    expect(() =>
      assertFixedPlan(document.planRef, { ...planSnapshot, revision: `sha256:${'b'.repeat(64)}` })
    ).toThrow('来源已改变')
  })

  it('records a verdict with its ledger revision and refuses an unnamed source', async () => {
    const document = draft()
    const decided = await recordHumanDecision({
      document,
      plan,
      goalId: 'g1',
      outcome: 'met',
      source: '验收界面人工确认',
      reason: '',
      recordedAt: '2026-09-25T10:00:00Z'
    })
    const verdict = decided.results.find((result) => result.goalId === 'g1')?.decision
    expect(verdict?.outcome).toBe('met')
    expect(verdict?.materialRevision).toBe(await goalEvidenceRevision(document, plan, 'g1'))
    // The other goal keeps no verdict: nothing is inferred from a neighbour.
    expect(decided.results.find((result) => result.goalId === 'g2')?.decision).toBeUndefined()
    await expect(
      recordHumanDecision({
        document,
        plan,
        goalId: 'g1',
        outcome: 'met',
        source: '   ',
        reason: '',
        recordedAt: '2026-09-25T10:00:00Z'
      })
    ).rejects.toThrow('请注明判断人或人的确认来源')
  })

  it('hashes version-level evidence but never the decision itself', async () => {
    const document = draft()
    document.preparedArtifacts = [
      {
        artifactId: 'report',
        kind: 'verification',
        candidateRef: document.candidateRef!,
        location: '.bw/planning/v0.5/acceptance-evidence.html',
        generatedAt: '2026-09-25T10:00:00Z'
      }
    ]
    const before = await goalEvidenceRevision(document, plan, 'g1')
    const result = document.results[0]
    result.decision = {
      outcome: 'met',
      source: 'human',
      recordedAt: '2026-09-25T10:01:00Z',
      materialRevision: before,
      reason: '通过'
    }
    expect(await goalEvidenceRevision(document, plan, 'g1')).toBe(before)
    // Per-goal deliveries are retired, so registered evidence is version-level:
    // the report and the demo environment both move every goal's ledger revision.
    document.preparedArtifacts[0].checksum = 'changed'
    expect(await goalEvidenceRevision(document, plan, 'g1')).not.toBe(before)
    const withDemo = await goalEvidenceRevision(document, plan, 'g1')
    document.demoEnv = { kind: 'launched', detail: '桌面应用已启动' }
    expect(await goalEvidenceRevision(document, plan, 'g1')).not.toBe(withDemo)
  })

  it('opens the most recently generated evidence report, not the first registered', () => {
    const document = draft()
    expect(latestVerificationArtifact(document)).toBeUndefined()
    const candidate = document.candidateRef!
    document.preparedArtifacts = [
      {
        artifactId: 'old',
        kind: 'verification',
        candidateRef: candidate,
        location: 'old.html',
        generatedAt: '2026-09-25T10:00:00Z'
      },
      {
        artifactId: 'pkg',
        kind: 'package',
        candidateRef: candidate,
        location: 'build.zip',
        generatedAt: '2026-09-25T12:00:00Z'
      },
      {
        artifactId: 'new',
        kind: 'verification',
        candidateRef: candidate,
        location: 'new.html',
        generatedAt: '2026-09-25T11:00:00Z'
      }
    ]
    // One report per version is the rule, but a regeneration can leave two
    // registered; the board must not silently open the superseded one.
    expect(latestVerificationArtifact(document)?.location).toBe('new.html')
  })
})
