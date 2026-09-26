import { describe, expect, it } from 'vitest'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import { createAcceptanceMaterial } from './acceptance-model'
import { goalEvidenceRevision } from './acceptance-decision'
import { deriveAcceptanceReport } from './acceptance-report'

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

describe('acceptance task evidence and report', () => {
  it('binds fixed goal membership and stable facts while ignoring timestamp and list order changes', async () => {
    const document = material()
    document.taskSnapshot = tasks()
    const original = await goalEvidenceRevision(document, plan, 'g1')
    document.taskSnapshot.reverse()
    document.taskSnapshot.forEach((item) => {
      item.readAt = '2026-09-25T02:00:00Z'
    })
    expect(await goalEvidenceRevision(document, plan, 'g1')).toBe(original)
    const unrelated = document.taskSnapshot.find((item) => item.reference.number === 2)!
    if (unrelated.kind === 'ready') {
      unrelated.state = 'closed'
    }
    expect(await goalEvidenceRevision(document, plan, 'g1')).toBe(original)
    const related = document.taskSnapshot.find((item) => item.reference.number === 1)!
    related.reference = { ...related.reference, goalId: 'g2' }
    if (related.kind === 'ready') {
      related.state = 'closed'
    }
    expect(await goalEvidenceRevision(document, plan, 'g1')).not.toBe(original)
  })
  it('keeps missing, empty and failed snapshots distinct without generating an acceptance conclusion', async () => {
    const document = material()
    const absent = await goalEvidenceRevision(document, plan, 'g1')
    expect(deriveAcceptanceReport({ document, plan, revision: 'draft' }).markdown).toContain(
      '尚未记录 Issue 快照'
    )
    document.taskSnapshot = []
    expect(await goalEvidenceRevision(document, plan, 'g1')).not.toBe(absent)
    expect(deriveAcceptanceReport({ document, plan, revision: 'draft' }).markdown).toContain(
      '固定计划仍引用 2 项任务'
    )
    document.taskSnapshot = [
      {
        kind: 'unavailable',
        reference: plan.tasks[0],
        readAt: '2026-09-25T02:00:00Z',
        error: '宿主离线'
      }
    ]
    const report = deriveAcceptanceReport({ document, plan, revision: 'draft' })
    expect(report.markdown).toContain('读取失败：宿主离线')
    expect(report.markdown).toContain('2026-09-25T02:00:00Z')
    expect(report.markdown).toContain('记录结论：待核')
  })
  it('renders the stored provider source and state without changing the evidence', () => {
    const document = material()
    document.taskSnapshot = tasks()
    const before = JSON.stringify(document)
    const report = deriveAcceptanceReport({ document, plan, revision: 'sha256:recorded' })
    expect(report.markdown).toContain('状态 opened')
    expect(report.markdown).toContain('ssh:build')
    expect(report.markdown).toContain('codehub.example/team/app')
    expect(JSON.stringify(document)).toBe(before)
  })
})
