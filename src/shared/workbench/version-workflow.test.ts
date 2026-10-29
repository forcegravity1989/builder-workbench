import { expect, it } from 'vitest'
import { AcceptanceMaterialSchema, PlanningMaterialSchema } from './version-material'

it('keeps the workflow section optional and rejects stages outside the workflow', () => {
  const plan = {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    summary: { progress: '', risks: '' },
    goals: [],
    tasks: []
  }
  expect(PlanningMaterialSchema.safeParse(plan).success).toBe(true)
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      workflow: { stage: 'breakdown', updatedAt: '2026-10-13T08:00:00Z' }
    }).success
  ).toBe(true)
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      workflow: {
        stage: 'archive',
        updatedAt: '2026-10-13T08:00:00Z',
        archivePr: { provider: 'github', repository: 'github.com/acme/project', number: 12 }
      }
    }).success
  ).toBe(true)
  // Acceptance-only stage names must not validate on plan material.
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      workflow: { stage: 'showcase', updatedAt: '2026-10-13T08:00:00Z' }
    }).success
  ).toBe(false)
  expect(
    AcceptanceMaterialSchema.safeParse({
      schema_version: 3,
      version: 'v1',
      cycleId: 'cycle',
      planRef: {
        kind: 'committed',
        version: 'v1',
        cycleId: 'plan-cycle',
        revision: `sha256:${'a'.repeat(64)}`,
        sourceCommit: '1'.repeat(40)
      },
      preparedArtifacts: [],
      results: [],
      workflow: { stage: 'showcase', updatedAt: '2026-10-13T08:00:00Z' }
    }).success
  ).toBe(true)
  // #462: the acceptance workflow carries the release read-back key (tag only);
  // plan material has no release row, so the reference stays acceptance-only.
  expect(
    AcceptanceMaterialSchema.safeParse({
      schema_version: 3,
      version: 'v1',
      cycleId: 'cycle',
      planRef: {
        kind: 'committed',
        version: 'v1',
        cycleId: 'plan-cycle',
        revision: `sha256:${'a'.repeat(64)}`,
        sourceCommit: '1'.repeat(40)
      },
      preparedArtifacts: [],
      results: [],
      workflow: {
        stage: 'archive',
        updatedAt: '2026-10-13T08:00:00Z',
        release: { tag: 'v0.7.0' }
      }
    }).success
  ).toBe(true)
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      workflow: {
        stage: 'archive',
        updatedAt: '2026-10-13T08:00:00Z',
        release: { tag: 'v0.7.0' }
      }
    }).success
  ).toBe(false)
})
