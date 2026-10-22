import { z } from 'zod'

/**
 * SOP stage track for the plan/acceptance cycle screens. The session model
 * records the last completed stage in the material via the CLI; it calibrates
 * session recovery and automation. Neither board renders it — the journey lamps
 * are retired (plan since G3, acceptance since v10), so stage drives no UI
 * colour and no completion claim. Absent state means not started.
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
