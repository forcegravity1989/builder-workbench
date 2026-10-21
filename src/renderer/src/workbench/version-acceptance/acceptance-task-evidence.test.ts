import { describe, expect, it } from 'vitest'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import { createAcceptanceMaterial } from './acceptance-model'
import { goalEvidenceRevision } from './acceptance-decision'
import { buildAcceptanceReport, deriveAcceptanceReport } from './acceptance-report'

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
    expect(deriveAcceptanceReport({ document, plan }).markdown).toContain('尚未记录 Issue 快照')
    document.taskSnapshot = []
    expect(await goalEvidenceRevision(document, plan, 'g1')).not.toBe(absent)
    expect(deriveAcceptanceReport({ document, plan }).markdown).toContain('固定计划仍引用 2 项任务')
    document.taskSnapshot = [
      {
        kind: 'unavailable',
        reference: plan.tasks[0],
        readAt: '2026-09-25T02:00:00Z',
        error: '宿主离线'
      }
    ]
    const report = deriveAcceptanceReport({ document, plan })
    expect(report.markdown).toContain('读取失败（宿主离线）')
    expect(report.markdown).toContain('结论：待核')
  })
  it('renders the stored provider source and state without changing the evidence', async () => {
    const document = material()
    document.taskSnapshot = tasks()
    document.results[0] = {
      ...document.results[0],
      progress: '本轮完成联调',
      materials: [{ label: '验收截图', url: 'https://example.test/evidence' }],
      issueNotes: { 'codehub:codehub.example/team/app:1': '补齐证据' },
      issueMarks: { 'codehub:codehub.example/team/app:1': { carry: true, risk: true } },
      meetingDirectives: [
        {
          id: 'directive-1',
          text: '下周复核边界',
          tag: 'next-week-plan',
          status: 'pending',
          source: 'transcript-summary',
          sourceRef: 'issue-374#summary'
        }
      ]
    }
    const before = JSON.stringify(document)
    const report = deriveAcceptanceReport({ document, plan })
    expect(report.markdown).toContain('：opened')
    expect(report.markdown).toContain('codehub.example/team/app')
    expect(report.markdown).toContain('本轮进展：本轮完成联调')
    expect(report.markdown).toContain('验收截图')
    expect(report.markdown).toContain('备注：补齐证据')
    expect(report.markdown).toContain('标记：遗留、风险')
    expect(report.markdown).toContain('会议指导：下周复核边界（待确认；纳入下周计划；AI 总结）')
    expect(report.markdown).toContain('来源：issue-374\\#summary')
    expect(JSON.stringify(document)).toBe(before)
    document.results[0].decision = {
      outcome: 'met',
      source: '用户',
      reason: '已展示',
      recordedAt: '2026-10-19T12:00:00Z',
      materialRevision: await goalEvidenceRevision(document, plan, 'g1')
    }
    expect((await buildAcceptanceReport(document, plan)).markdown).not.toContain('证据已变化')
    document.results[0].progress = '会后补充了新的证据'
    expect((await buildAcceptanceReport(document, plan)).markdown).toContain(
      '证据已变化，请重新核对'
    )
  })
})
