import { expect, it } from 'vitest'
import {
  archiveJourneyLamp,
  isArchivedMaterial,
  type ArchivedMaterial,
  type ArchiveStatus
} from './version-archive'

it('requires one provider-verified merge and matching material identity for an archived signal', () => {
  const material: ArchivedMaterial = {
    workflow: 'plan',
    version: 'v1',
    cycleId: 'cycle',
    revision: `sha256:${'a'.repeat(64)}`
  }
  const reference = {
    provider: 'github',
    repository: 'github.com/team/project',
    number: 9,
    materialRevision: material.revision
  }
  const checkedAt = '2026-09-25T00:00:00Z'
  const mergeCommit = 'b'.repeat(40)
  const status: ArchiveStatus = {
    kind: 'merged',
    reference,
    checkedAt,
    url: 'https://github.com/team/project/pull/9',
    checks: 'unknown',
    review: 'unknown',
    mergeCommit,
    proof: { kind: 'verified', value: { reference, mergeCommit, material, checkedAt } }
  }
  expect(isArchivedMaterial(status, material)).toBe(true)
  expect(
    isArchivedMaterial(
      { ...status, proof: { kind: 'unknown', reason: 'File bytes not read' } },
      material
    )
  ).toBe(false)
  expect(isArchivedMaterial({ ...status, mergeCommit: null }, material)).toBe(false)
  expect(
    isArchivedMaterial(
      { ...status, reference: { ...reference, repository: 'github.com/other/project' } },
      material
    )
  ).toBe(false)
  expect(isArchivedMaterial(status, { ...material, cycleId: 'another-cycle' })).toBe(false)
  expect(isArchivedMaterial(status, { ...material, workflow: 'acceptance' })).toBe(false)
})

it('derives the archive journey lamp from provider-confirmed states only', () => {
  const reference = {
    provider: 'github',
    repository: 'github.com/team/project',
    number: 9,
    materialRevision: `sha256:${'a'.repeat(64)}`
  }
  const open = {
    kind: 'open' as const,
    reference,
    url: 'https://github.com/team/project/pull/9',
    checkedAt: '2026-09-25T00:00:00Z',
    checks: 'passed' as const,
    review: 'pending' as const,
    mergeCommit: null,
    proof: { kind: 'unknown' as const, reason: '评审尚未合入' }
  }
  expect(archiveJourneyLamp({ kind: 'unknown', reason: 'x' }, false)).toBe('unknown')
  expect(archiveJourneyLamp({ kind: 'not-created', checkedAt: 'x' }, false)).toBe('unknown')
  expect(archiveJourneyLamp(open, false)).toBe('pending')
  expect(archiveJourneyLamp({ ...open, kind: 'closed' }, false)).toBe('failed')
  expect(archiveJourneyLamp({ ...open, checks: 'failed' }, false)).toBe('failed')
  expect(archiveJourneyLamp({ ...open, review: 'changes-requested' }, false)).toBe('failed')
  expect(archiveJourneyLamp({ ...open, kind: 'merged' }, false)).toBe('pending')
  expect(archiveJourneyLamp({ ...open, kind: 'merged' }, true)).toBe('complete')
})
