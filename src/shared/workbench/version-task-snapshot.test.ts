import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AcceptanceMaterialSchema, VersionTaskSnapshotSchema } from './version-material'

const ready = {
  kind: 'ready',
  reference: { provider: 'codehub', repository: 'codehub.example/team/app', number: 8 },
  source: {
    kind: 'task-source',
    provider: 'codehub',
    projectId: 'project',
    hostId: 'ssh:build',
    repoId: 'repo',
    providerIdentity: { provider: 'codehub', host: 'codehub.example', project: 'team/app' }
  },
  iid: 8,
  title: 'Ship plan',
  state: 'opened',
  url: 'https://codehub.example/team/app/issues/8',
  readAt: '2026-09-24T09:00:00Z'
}

describe('version task snapshots', () => {
  it('retains explicit native and forge identities and refuses missing host or mismatched task', () => {
    expect(VersionTaskSnapshotSchema.parse(ready).source).toMatchObject(ready.source)
    const labeled = VersionTaskSnapshotSchema.parse({ ...ready, labels: ['bug', 'feature'] })
    expect(labeled.kind === 'ready' ? labeled.labels : undefined).toEqual(['bug', 'feature'])
    expect(
      VersionTaskSnapshotSchema.safeParse({
        ...ready,
        source: { ...ready.source, hostId: undefined }
      }).success
    ).toBe(false)
    expect(VersionTaskSnapshotSchema.safeParse({ ...ready, iid: 9 }).success).toBe(false)
    expect(
      VersionTaskSnapshotSchema.safeParse({
        ...ready,
        reference: { ...ready.reference, provider: 'github' }
      }).success
    ).toBe(false)
  })
  it('records failed reads with time and keeps unrecorded distinct from no tasks', () => {
    expect(
      VersionTaskSnapshotSchema.parse({
        kind: 'unavailable',
        reference: ready.reference,
        readAt: ready.readAt,
        error: 'Host unavailable'
      })
    ).toHaveProperty('error', 'Host unavailable')
    const acceptance = {
      schema_version: 3,
      version: 'v0.5',
      cycleId: 'week-1',
      planRef: {
        kind: 'committed',
        version: 'v0.5',
        cycleId: 'week-1',
        revision: 'sha256:'.concat('a'.repeat(64)),
        sourceCommit: 'b'.repeat(40)
      },
      preparedArtifacts: [],
      results: []
    }
    expect(AcceptanceMaterialSchema.parse(acceptance).taskSnapshot).toBeUndefined()
    expect(
      AcceptanceMaterialSchema.parse({ ...acceptance, taskSnapshot: [] }).taskSnapshot
    ).toEqual([])
    const enriched = AcceptanceMaterialSchema.parse({
      ...acceptance,
      taskSnapshot: [{ ...ready, labels: ['bug'] }],
      results: [
        {
          goalId: 'g1',
          deliveries: [],
          materials: [{ label: '验收材料', url: 'https://example.test/material' }],
          readings: [],
          note: '',
          progress: '已完成接口联调',
          nextStep: '',
          rounds: [
            {
              id: 'r1',
              week: '2026-W42',
              kind: 'progress',
              snapshot: {
                goals: [{ goalId: 'g1', decision: 'pending', progress: '进行中' }],
                issueMarks: { 'issue-1': { carry: true } },
                issueNotes: { 'issue-1': '下周继续核对' }
              }
            }
          ],
          meetingDirectives: [
            {
              id: 'd1',
              text: '补齐材料链接',
              tag: 'record-remaining',
              status: 'pending',
              source: 'transcript-summary'
            }
          ],
          issueNotes: { 'issue-1': '需要补充证据' },
          issueMarks: { 'issue-1': { risk: true } }
        }
      ]
    })
    expect(enriched.results[0].materials).toEqual([
      { label: '验收材料', url: 'https://example.test/material' }
    ])
    expect(enriched.results[0].progress).toBe('已完成接口联调')
    expect(enriched.results[0].rounds?.[0].snapshot.issueMarks).toEqual({
      'issue-1': { carry: true }
    })
    expect(enriched.results[0].meetingDirectives?.[0].status).toBe('pending')
  })
  it('exports the input schema including required source host without losing CLI schema support', () => {
    const schema = z.toJSONSchema(AcceptanceMaterialSchema, { io: 'input' })
    const serialized = JSON.stringify(schema)
    expect(serialized).toContain('taskSnapshot')
    expect(serialized).toContain('hostId')
  })
})
