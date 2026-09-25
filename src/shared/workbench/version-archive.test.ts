import { expect, it } from 'vitest'
import { isArchivedMaterial, type ArchivedMaterial, type ArchiveStatus } from './version-archive'

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
