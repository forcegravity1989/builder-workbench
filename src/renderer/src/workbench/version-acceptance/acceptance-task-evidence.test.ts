import { describe, expect, it } from 'vitest'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import { createAcceptanceMaterial } from './acceptance-model'
import { goalEvidenceRevision, recordHumanDecision } from './acceptance-decision'
import { mergeAcceptanceMaterial } from './acceptance-merge'

const plan: PlanningMaterial = {
  schema_version: 3,
  version: 'v0.5',
  cycleId: 'plan-cycle',
  summary: { progress: '', risks: '' },
  goals: ['g1', 'g2'].map((goalId) => ({ goalId, title: goalId, metricTargets: [] })),
  tasks: [1, 2].map((number) => ({
    provider: 'codehub',
    repository: 'codehub.example/team/app',
    number,
    goalId: `g${number}`
  }))
}
function material(): AcceptanceMaterial {
  const revision = `sha256:${'a'.repeat(64)}`
  return createAcceptanceMaterial({
    plan: { document: plan, revision },
    cycleId: 'acceptance-cycle',
    planRef: {
      kind: 'committed',
      version: plan.version,
      cycleId: plan.cycleId,
      revision,
      sourceCommit: 'b'.repeat(40)
    }
  })
}
function tasks(): VersionTaskSnapshot[] {
  return plan.tasks.map((reference) => ({
    kind: 'ready',
    reference,
    iid: reference.number,
    title: `Issue ${reference.number}`,
    state: 'opened',
    url: `https://codehub.example/team/app/issues/${reference.number}`,
    readAt: '2026-09-25T01:00:00Z',
    source: {
      kind: 'task-source',
      provider: 'codehub',
      projectId: 'project',
      hostId: 'ssh:build',
      repoId: 'repo',
      providerIdentity: { provider: 'codehub', host: 'codehub.example', project: 'team/app' }
    }
  }))
}

describe('acceptance task evidence', () => {
  it('binds the supplied goal membership and stable facts while ignoring timestamp and list order changes', async () => {
    const document = material()
    document.taskSnapshot = tasks()
    const original = await goalEvidenceRevision(document, plan, 'g1', plan.tasks)
    document.taskSnapshot.reverse()
    document.taskSnapshot.forEach((item) => {
      item.readAt = '2026-09-25T02:00:00Z'
    })
    expect(await goalEvidenceRevision(document, plan, 'g1', plan.tasks)).toBe(original)
    const unrelated = document.taskSnapshot.find((item) => item.reference.number === 2)!
    if (unrelated.kind === 'ready') {
      unrelated.state = 'closed'
    }
    expect(await goalEvidenceRevision(document, plan, 'g1', plan.tasks)).toBe(original)
    const related = document.taskSnapshot.find((item) => item.reference.number === 1)!
    related.reference = { ...related.reference, goalId: 'g2' }
    if (related.kind === 'ready') {
      related.state = 'closed'
    }
    expect(await goalEvidenceRevision(document, plan, 'g1', plan.tasks)).not.toBe(original)
  })

  it('keeps missing, empty and failed snapshots distinct without generating an acceptance conclusion', async () => {
    const document = material()
    // Absent means not recorded, [] records an empty set, and a failed read keeps
    // its error: three different ledger revisions, none of them a verdict.
    const absent = await goalEvidenceRevision(document, plan, 'g1', plan.tasks)
    expect(document.results.every((result) => !result.decision)).toBe(true)
    document.taskSnapshot = []
    const empty = await goalEvidenceRevision(document, plan, 'g1', plan.tasks)
    expect(empty).not.toBe(absent)
    expect(await goalEvidenceRevision(document, plan, 'g1', null)).not.toBe(
      await goalEvidenceRevision(document, plan, 'g1', [])
    )
    document.taskSnapshot = [
      {
        kind: 'unavailable',
        reference: plan.tasks[0],
        readAt: '2026-09-25T02:00:00Z',
        error: '宿主离线'
      }
    ]
    expect(await goalEvidenceRevision(document, plan, 'g1', plan.tasks)).not.toBe(empty)
    expect(document.results.every((result) => !result.decision)).toBe(true)
    const replacement = { ...plan.tasks[0], number: 3 }
    const decision = await recordHumanDecision({
      document,
      plan,
      goalId: 'g1',
      references: [replacement],
      reads: [
        {
          kind: 'unavailable',
          reference: replacement,
          readAt: '2026-09-25T02:00:00Z',
          error: '宿主离线'
        }
      ],
      outcome: 'met',
      source: 'human',
      reason: '',
      recordedAt: '2026-09-25T02:00:00Z'
    })
    const remote = { ...document, taskSnapshot: tasks() }
    const merged = mergeAcceptanceMaterial(document, decision, remote)
    expect(merged.taskSnapshot?.map((item) => item.reference.number)).toEqual([2, 3])
  })
})
