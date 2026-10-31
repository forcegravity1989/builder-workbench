import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { AcceptanceMaterial } from '../../shared/workbench/version-material'
import { VersionDocumentError } from '../../shared/workbench/version-document'
import { WorkspaceScopeError } from './workspace-scope-error'
import {
  buildPreparedArtifact,
  defaultArtifactId,
  registerPreparedArtifact,
  resolveArtifactFile,
  upsertPreparedArtifact
} from './version-material-artifact'

const candidate = { repository: 'github.com/acme/project', version: 'v0.5', commit: '2'.repeat(40) }
function document(overrides: Partial<AcceptanceMaterial> = {}): AcceptanceMaterial {
  return {
    schema_version: 3,
    version: 'v0.5',
    cycleId: 'cycle-1',
    planRef: {
      kind: 'committed',
      version: 'v0.5',
      cycleId: 'cycle-1',
      revision: `sha256:${'a'.repeat(64)}`,
      sourceCommit: '1'.repeat(40)
    },
    candidateRef: candidate,
    preparedArtifacts: [],
    results: [],
    ...overrides
  }
}

it('resolves only in-tree relative artifact locations', () => {
  expect(resolveArtifactFile('/root', 'a/b.html')).toBe(join('/root', 'a', 'b.html'))
  expect(resolveArtifactFile('/root', 'a\\b.html')).toBe(join('/root', 'a', 'b.html'))
  expect(resolveArtifactFile('/root', './a.html')).toBe(join('/root', 'a.html'))
  for (const unsafe of ['/tmp/x.html', 'C:\\x.html', '', '.', 'a/../b.html', '..']) {
    expect(() => resolveArtifactFile('/root', unsafe)).toThrowError(VersionDocumentError)
  }
})

it('builds an artifact from the stored candidate, defaulting the id and ISO mtime', () => {
  const artifact = buildPreparedArtifact(
    document(),
    { kind: 'verification', location: '.bw/planning/v0.5/report.html', artifactId: undefined },
    new Date('2026-10-31T02:03:04Z').getTime()
  )
  expect(artifact).toEqual({
    artifactId: 'verification-v0.5-report.html',
    kind: 'verification',
    location: '.bw/planning/v0.5/report.html',
    candidateRef: candidate,
    generatedAt: '2026-10-31T02:03:04.000Z'
  })
  expect(
    buildPreparedArtifact(
      document(),
      {
        kind: 'package',
        location: 'build.zip',
        artifactId: 'custom',
        command: 'pnpm run build',
        checksum: 'sha256:0'
      },
      0
    )
  ).toEqual({
    artifactId: 'custom',
    kind: 'package',
    location: 'build.zip',
    candidateRef: candidate,
    generatedAt: '1970-01-01T00:00:00.000Z',
    command: 'pnpm run build',
    checksum: 'sha256:0'
  })
  // candidateRef 复用材料现有值：候选未固定就拒绝，不由登记命令编造。
  expect(() =>
    buildPreparedArtifact(
      document({ candidateRef: undefined }),
      { kind: 'verification', location: 'report.html' },
      0
    )
  ).toThrowError(WorkspaceScopeError)
  expect(defaultArtifactId('verification', 'v0.5', 'dir/report.html')).toBe(
    'verification-v0.5-report.html'
  )
})

it('upserts by artifactId: reruns replace in place instead of appending', () => {
  const first = buildPreparedArtifact(document(), { kind: 'verification', location: 'r.html' }, 1)
  const base = upsertPreparedArtifact(document(), first)
  expect(base.preparedArtifacts).toHaveLength(1)
  const regenerated = { ...first, generatedAt: '2026-10-31T03:00:00.000Z' }
  const rerun = upsertPreparedArtifact(
    { ...base, results: [{ goalId: 'g1', readings: [], note: '', nextStep: '' }] },
    regenerated
  )
  expect(rerun.preparedArtifacts).toEqual([regenerated])
  expect(rerun.results).toEqual([{ goalId: 'g1', readings: [], note: '', nextStep: '' }])
  const other = buildPreparedArtifact(document(), { kind: 'package', location: 'b.zip' }, 2)
  expect(upsertPreparedArtifact(rerun, other).preparedArtifacts).toHaveLength(2)
})

it('registers with one conflict retry on a fresh document, then reports currentRevision', async () => {
  const first = buildPreparedArtifact(document(), { kind: 'verification', location: 'r.html' }, 1)
  const second = { ...first, generatedAt: '2026-10-31T04:00:00.000Z' }
  // 冲突重试在新鲜文档上重建制品：并发人工输入（新 note）不被覆盖。
  const concurrent = {
    ...document(),
    results: [{ goalId: 'g1', readings: [], note: '人工备注', nextStep: '' }]
  }
  let reads = 0
  const registered = await registerPreparedArtifact(
    async () =>
      ++reads === 1
        ? { document: document(), revision: 'sha256:old' }
        : { document: concurrent, revision: 'sha256:current' },
    async (expectedRevision) => {
      expect(expectedRevision).toBe(reads === 1 ? 'sha256:old' : 'sha256:current')
      if (reads === 1) {
        throw new VersionDocumentError('revision-conflict', 'changed', 'sha256:current')
      }
      return 'sha256:saved'
    },
    (current) => buildPreparedArtifact(current, { kind: 'verification', location: 'r.html' }, 1)
  )
  expect(registered).toEqual({ revision: 'sha256:saved', artifact: first })
  await expect(
    registerPreparedArtifact(
      async () => null,
      async () => 'unused',
      () => first
    )
  ).rejects.toMatchObject({ code: 'invalid-document' })
  // 仍冲突：报错并带 currentRevision，不循环覆盖。
  let conflicts = 0
  await expect(
    registerPreparedArtifact(
      async () => ({
        document: document({ preparedArtifacts: [second] }),
        revision: 'sha256:stale'
      }),
      async () => {
        conflicts += 1
        throw new VersionDocumentError('revision-conflict', 'changed', 'sha256:live')
      },
      (current) => buildPreparedArtifact(current, { kind: 'verification', location: 'r.html' }, 1)
    )
  ).rejects.toMatchObject({
    code: 'revision-conflict',
    currentRevision: 'sha256:live',
    message: expect.stringContaining('sha256:live')
  })
  expect(conflicts).toBe(2)
})
