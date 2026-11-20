import { z } from 'zod'
import { materialObject } from './version-material-common'

/**
 * SOP stage track for the plan/acceptance cycle screens. The session model
 * records the last completed stage in the material via the CLI; it calibrates
 * session recovery and automation. The project wall and version overview
 * display the recorded progress. Board navigation and human decisions are
 * independent of the stored stage.
 */
export const PLAN_WORKFLOW_STAGES = [
  'preparation',
  'goals',
  'breakdown',
  'review',
  'archive'
] as const
export const ACCEPTANCE_WORKFLOW_STAGES = ['preparation', 'showcase', 'archive'] as const

export type PlanWorkflowStage = (typeof PLAN_WORKFLOW_STAGES)[number]
export type AcceptanceWorkflowStage = (typeof ACCEPTANCE_WORKFLOW_STAGES)[number]

/** PR/MR reference recorded by the model when the archive stage opens a review. */
export const WorkflowArchivePrSchema = materialObject({
  provider: z.string().min(1),
  repository: z.string().min(1),
  number: z.number().int().positive()
})
export type WorkflowArchivePr = z.infer<typeof WorkflowArchivePrSchema>

/**
 * Release reference recorded by the model after the human-authorized release
 * run (#462). The tag is only the read-back key — published time, Release URL
 * and assets are provider-computed on every read and never stored here; the
 * Git tag and the provider Release page stay the source of truth.
 */
export const WorkflowReleaseRefSchema = materialObject({
  tag: z.string().min(1)
})
export type WorkflowReleaseRef = z.infer<typeof WorkflowReleaseRefSchema>

export const PlanWorkflowStateSchema = materialObject({
  stage: z.enum(PLAN_WORKFLOW_STAGES),
  updatedAt: z.iso.datetime({ offset: true }),
  archivePr: WorkflowArchivePrSchema.optional()
}).superRefine((workflow, context) => {
  if (Object.hasOwn(workflow, 'release')) {
    context.addIssue({
      code: 'custom',
      message: 'Plan workflow cannot carry acceptance release metadata',
      path: ['release']
    })
  }
})
export const AcceptanceWorkflowStateSchema = materialObject({
  stage: z.enum(ACCEPTANCE_WORKFLOW_STAGES),
  updatedAt: z.iso.datetime({ offset: true }),
  archivePr: WorkflowArchivePrSchema.optional(),
  release: WorkflowReleaseRefSchema.optional()
})
export type PlanWorkflowState = z.infer<typeof PlanWorkflowStateSchema>
export type AcceptanceWorkflowState = z.infer<typeof AcceptanceWorkflowStateSchema>
