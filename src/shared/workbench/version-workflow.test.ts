import { expect, it } from 'vitest'
import {
  ACCEPTANCE_WORKFLOW_STAGES,
  PLAN_WORKFLOW_STAGES,
  workflowStageIndex
} from './version-workflow'
import { AcceptanceMaterialSchema, PlanningMaterialSchema } from './version-material'

it('lights every lamp at or before the recorded stage and none beyond', () => {
  // Absent or unrecognized stages leave all lamps gray — never a guessed green.
  expect(workflowStageIndex(PLAN_WORKFLOW_STAGES, undefined)).toBe(-1)
  expect(workflowStageIndex(PLAN_WORKFLOW_STAGES, 'bogus')).toBe(-1)
  expect(workflowStageIndex(PLAN_WORKFLOW_STAGES, 'preparation')).toBe(0)
  expect(workflowStageIndex(PLAN_WORKFLOW_STAGES, 'review')).toBe(2)
  expect(workflowStageIndex(PLAN_WORKFLOW_STAGES, 'archive')).toBe(4)
  expect(workflowStageIndex(ACCEPTANCE_WORKFLOW_STAGES, 'showcase')).toBe(1)
  expect(workflowStageIndex(ACCEPTANCE_WORKFLOW_STAGES, 'archive')).toBe(2)
})

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
})
