import { describe, expect, it } from 'vitest'
import {
  AcceptanceMaterialSchema,
  type AcceptanceMaterial
} from '../../../../shared/workbench/version-material'
import { projectLegacyAcceptance } from './acceptance-legacy'

const revision = `sha256:${'a'.repeat(64)}`

/** A document shaped exactly like what v9.5 wrote, retired fields included. */
const legacyDocument = {
  schema_version: 3,
  version: 'v0.6',
  cycleId: 'cycle-legacy',
  planRef: {
    kind: 'committed',
    version: 'v0.6',
    cycleId: 'plan-cycle',
    revision,
    sourceCommit: 'b'.repeat(40)
  },
  preparedArtifacts: [],
  results: [
    {
      goalId: 'g1',
      deliveries: [{ title: '演示页', location: 'https://example.test/demo' }],
      materials: [{ label: '验收截图', url: 'https://example.test/evidence' }],
      readings: [],
      decision: {
        outcome: 'met',
        source: '验收界面人工确认',
        recordedAt: '2026-10-01T00:00:00Z',
        materialRevision: revision,
        reason: '已展示'
      },
      note: '旧说明',
      progress: '本轮完成联调',
      nextStep: '',
      issueNotes: { 'github:github.com/acme/app:1': '需要补证据' },
      issueMarks: { 'github:github.com/acme/app:1': { carry: true, risk: true } },
      rounds: [
        {
          id: 'r1',
          week: '2026-W40',
          kind: 'progress',
          closedAt: '2026-10-02T00:00:00Z',
          sourceCommit: 'c'.repeat(40),
          sourceRevision: revision,
          snapshot: {
            goals: [{ goalId: 'g1', decision: 'pending', progress: '进行中' }],
            issueMarks: { 'github:github.com/acme/app:1': { carry: true } },
            issueNotes: {}
          }
        }
      ],
      meetingDirectives: [
        {
          id: 'd1',
          text: '纳入下版的事项',
          tag: 'next-week-plan',
          status: 'confirmed',
          source: 'transcript-summary',
          sourceRef: 'meeting-1',
          confirmedAt: '2026-10-02T01:00:00Z'
        },
        {
          id: 'd2',
          text: '会上已解决',
          tag: 'resolved-this-acceptance',
          status: 'pending',
          source: 'manual',
          sourceRef: 'conversation:s1/m2'
        }
      ]
    }
  ]
}

describe('legacy acceptance material', () => {
  it('parses a pre-v10 document as-is instead of failing the strict schema', () => {
    // The material schema is strict, so dropping the retired keys outright would
    // turn every stored pre-v10 file into "corrupt material" and lose real human
    // input. They stay optional and read-only.
    const parsed = AcceptanceMaterialSchema.parse(legacyDocument)
    expect(parsed.results[0].progress).toBe('本轮完成联调')
    expect(parsed.results[0].deliveries).toEqual([
      { title: '演示页', location: 'https://example.test/demo' }
    ])
    expect(parsed.results[0].rounds?.[0].week).toBe('2026-W40')
    expect(parsed.results[0].meetingDirectives?.[0].tag).toBe('next-week-plan')
    expect(parsed.results[0].issueMarks?.['github:github.com/acme/app:1']).toEqual({
      carry: true,
      risk: true
    })
    // Current fields on the same document still parse normally.
    expect(parsed.results[0].decision?.outcome).toBe('met')
    expect(parsed.results[0].issueNotes).toEqual({ 'github:github.com/acme/app:1': '需要补证据' })
  })

  it('projects every legacy category for the read-only block, and nothing for a v10 document', () => {
    const parsed = AcceptanceMaterialSchema.parse(legacyDocument)
    const legacy = projectLegacyAcceptance(parsed)
    expect(legacy).not.toBeNull()
    expect(legacy?.roundCount).toBe(1)
    expect(legacy?.directiveCount).toBe(2)
    expect(legacy?.riskCount).toBe(1)
    const goal = legacy?.goals[0]
    expect(goal?.goalId).toBe('g1')
    expect(goal?.progress).toBe('本轮完成联调')
    expect(goal?.deliveries).toHaveLength(1)
    expect(goal?.materials).toEqual([{ label: '验收截图', url: 'https://example.test/evidence' }])
    expect(goal?.riskIssues).toEqual(['github:github.com/acme/app:1'])
    // Labels are human-readable, not raw protocol enums.
    expect(goal?.directives.map((item) => [item.tag, item.status, item.source])).toEqual([
      ['纳入下周计划', '已确认', '会议转写总结'],
      ['本次验收已解决', '待确认', '人工提供']
    ])
    expect(goal?.rounds).toEqual([
      { id: 'r1', week: '2026-W40', kind: '进展轮', closedAt: '2026-10-02T00:00:00Z' }
    ])

    // A document written by v10 has nothing legacy, so the block stays out.
    const current: AcceptanceMaterial = {
      ...parsed,
      results: [{ goalId: 'g1', readings: [], note: '', nextStep: '' }]
    }
    expect(projectLegacyAcceptance(current)).toBeNull()
    // A carry mark alone is not legacy — it is the current 延期遗留 human field.
    expect(
      projectLegacyAcceptance({
        ...current,
        results: [
          {
            ...current.results[0],
            issueMarks: { 'github:github.com/acme/app:1': { carry: true } }
          }
        ]
      })
    ).toBeNull()
  })
})
