import { z } from 'zod'

/**
 * SOP stage track for the plan/acceptance cycle screens. The session model
 * records the last completed stage in the material via the CLI; the journey
 * lamps are a pure position comparison against it — no content heuristics, no
 * provider probing. Absent state means not started (all lamps gray).
 */
export const PLAN_WORKFLOW_STAGES = [
  'preparation',
  'goals',
  'review',
  'breakdown',
  'archive'
] as const
export const ACCEPTANCE_WORKFLOW_STAGES = ['preparation', 'showcase', 'archive'] as const

export type PlanWorkflowStage = (typeof PLAN_WORKFLOW_STAGES)[number]
export type AcceptanceWorkflowStage = (typeof ACCEPTANCE_WORKFLOW_STAGES)[number]

/** Human-facing labels for the acceptance SOP stages; single source for the journey rail and the 4DX instrument. */
export const ACCEPTANCE_STAGE_LABELS: Record<AcceptanceWorkflowStage, string> = {
  preparation: '准备交付',
  showcase: '展示验收',
  archive: '归档'
}

/** PR/MR reference recorded by the model when the archive stage opens a review. */
export const WorkflowArchivePrSchema = z.strictObject({
  provider: z.string().min(1),
  repository: z.string().min(1),
  number: z.number().int().positive()
})
export type WorkflowArchivePr = z.infer<typeof WorkflowArchivePrSchema>

export const PlanWorkflowStateSchema = z.strictObject({
  stage: z.enum(PLAN_WORKFLOW_STAGES),
  updatedAt: z.iso.datetime({ offset: true }),
  archivePr: WorkflowArchivePrSchema.optional()
})
export const AcceptanceWorkflowStateSchema = z.strictObject({
  stage: z.enum(ACCEPTANCE_WORKFLOW_STAGES),
  updatedAt: z.iso.datetime({ offset: true }),
  archivePr: WorkflowArchivePrSchema.optional()
})
export type PlanWorkflowState = z.infer<typeof PlanWorkflowStateSchema>
export type AcceptanceWorkflowState = z.infer<typeof AcceptanceWorkflowStateSchema>

/**
 * Index of the last completed stage; -1 when absent or unrecognized. A lamp at
 * position i is green iff i <= index — one comparison, gray/green only.
 */
export function workflowStageIndex(stages: readonly string[], stage: string | undefined): number {
  if (stage === undefined) {
    return -1
  }
  return stages.indexOf(stage)
}
