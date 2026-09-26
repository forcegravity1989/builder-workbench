import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createArchiveEvidenceReader,
  resetArchiveEvidenceCacheForTests,
  type ArchiveEvidenceDeps
} from './archive-evidence'

const mergeCommit = 'b'.repeat(40)
const sourceCommit = 'a'.repeat(40)
const revisionOf = (raw: string) =>
  `sha256:${createHash('sha256').update(Buffer.from(raw)).digest('hex')}`
const materialDocument = {
  schema_version: 3,
  version: 'v1',
  cycleId: 'cycle-1',
  summary: { progress: '', risks: '' },
  goals: [],
  tasks: []
}
const materialBytes = Buffer.from(JSON.stringify(materialDocument))
const acceptanceDocument = {
  schema_version: 3,
  version: 'v1',
  cycleId: 'cycle-1',
  planRef: {
    kind: 'committed',
    version: 'v1',
    cycleId: 'cycle-1',
    sourceCommit,
    revision: `sha256:${'c'.repeat(64)}`
  },
  preparedArtifacts: [],
  results: []
}
const acceptanceBytes = Buffer.from(JSON.stringify(acceptanceDocument))
const acceptanceRevision = revisionOf(JSON.stringify(acceptanceDocument))
const revision = revisionOf(materialBytes.toString())
const candidate = {
  sourceCommit,
  version: 'v1',
  cycleId: 'cycle-1',
  workflow: 'plan' as const,
  revision
}

function deps(overrides: Partial<ArchiveEvidenceDeps> = {}): ArchiveEvidenceDeps {
  return {
    listPullsForCommit: vi.fn(async () => [{ number: 7, state: 'closed' }]),
    readPullMergeFacts: vi.fn(async () => ({ state: 'closed', merged: true, mergeCommit })),
    readMaterialAt: vi.fn(async () => materialBytes),
    now: () => '2026-09-26T00:00:00Z',
    ...overrides
  }
}

beforeEach(() => resetArchiveEvidenceCacheForTests())

describe('archive evidence from provider facts', () => {
  it('adopts a material commit whose PR merged at a later commit carrying the same bytes', async () => {
    const readMaterialAt = vi.fn(async (commit: string, path: string) => {
      expect(commit).toBe(mergeCommit)
      expect(path).toBe('.bw/planning/v1/data.json')
      return materialBytes
    })
    const state = await createArchiveEvidenceReader(
      'owner/project',
      deps({ readMaterialAt })
    ).archiveStateForCandidate(candidate)
    expect(state).toEqual({
      kind: 'adopted',
      proof: {
        reference: {
          provider: 'github',
          repository: 'owner/project',
          number: 7,
          materialRevision: revision
        },
        mergeCommit,
        material: { workflow: 'plan', version: 'v1', cycleId: 'cycle-1', revision },
        checkedAt: '2026-09-26T00:00:00Z'
      }
    })
  })

  it('treats an open review containing the commit as a working draft', async () => {
    const state = await createArchiveEvidenceReader(
      'owner/project',
      deps({ listPullsForCommit: vi.fn(async () => [{ number: 8, state: 'open' }]) })
    ).archiveStateForCandidate(candidate)
    expect(state).toEqual({ kind: 'draft' })
  })

  it('keeps commits without provider association an honest unknown', async () => {
    const state = await createArchiveEvidenceReader(
      'owner/project',
      deps({ listPullsForCommit: vi.fn(async () => []) })
    ).archiveStateForCandidate(candidate)
    expect(state).toEqual({ kind: 'unknown', message: '未取得该修订的真实归档依据' })
  })

  it('rejects a merged review whose tree carries different material bytes', async () => {
    const state = await createArchiveEvidenceReader(
      'owner/project',
      deps({ readMaterialAt: vi.fn(async () => Buffer.from('{"schema_version":3,"other":true}')) })
    ).archiveStateForCandidate(candidate)
    expect(state).toMatchObject({ kind: 'unknown' })
    expect(state).not.toMatchObject({ kind: 'adopted' })
  })

  it('rejects a merged review whose tree no longer contains the material', async () => {
    const state = await createArchiveEvidenceReader(
      'owner/project',
      deps({ readMaterialAt: vi.fn(async () => null) })
    ).archiveStateForCandidate(candidate)
    expect(state).toMatchObject({
      kind: 'unknown',
      message: '已合入评审的提交内容与所选材料修订不一致'
    })
  })

  it('reports provider outages as unknown instead of guessing', async () => {
    const state = await createArchiveEvidenceReader(
      'owner/project',
      deps({
        listPullsForCommit: vi.fn(async () => {
          throw new Error('rate limited')
        })
      })
    ).archiveStateForCandidate(candidate)
    expect(state).toMatchObject({
      kind: 'unknown',
      message: expect.stringContaining('rate limited')
    })
  })

  it('proves a merged review only when its commit tree matches the revision', async () => {
    const reader = createArchiveEvidenceReader(
      'owner/project',
      deps({ readMaterialAt: vi.fn(async () => acceptanceBytes) })
    )
    const verified = await reader.archiveProofForReview(7, {
      workflow: 'acceptance',
      version: 'v1',
      cycleId: 'cycle-1',
      revision: acceptanceRevision
    })
    expect(verified.mergeCommit).toBe(mergeCommit)
    expect(verified.proof.kind).toBe('verified')
    const unmerged = createArchiveEvidenceReader(
      'owner/other',
      deps({
        readPullMergeFacts: vi.fn(async () => ({ state: 'open', merged: false, mergeCommit: null }))
      })
    )
    const pending = await unmerged.archiveProofForReview(9, {
      workflow: 'plan',
      version: 'v1',
      cycleId: 'cycle-1',
      revision
    })
    expect(pending).toEqual({
      mergeCommit: null,
      proof: { kind: 'unknown', reason: '该评审没有 provider 返回的真实合入提交' }
    })
  })

  it('refuses to let a new cycle inherit an archived green over old bytes', async () => {
    const state = await createArchiveEvidenceReader(
      'owner/project',
      deps()
    ).archiveStateForCandidate({ ...candidate, cycleId: 'cycle-2' })
    expect(state).toMatchObject({ kind: 'unknown' })
    expect(state).not.toMatchObject({ kind: 'adopted' })
    const proof = await createArchiveEvidenceReader(
      'owner/project',
      deps()
    ).archiveProofForReview(7, {
      workflow: 'plan',
      version: 'v1',
      cycleId: 'cycle-2',
      revision
    })
    expect(proof.proof).toEqual({
      kind: 'unknown',
      reason: '合入提交中的材料属于其他周期，本轮尚未归档'
    })
  })
})
