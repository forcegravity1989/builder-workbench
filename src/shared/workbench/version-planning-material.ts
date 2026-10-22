import { z } from 'zod'
import { PlanWorkflowStateSchema } from './version-workflow'
import {
  Id,
  Identity,
  PlanningProgressSourceSchema,
  VersionGoalSchema,
  VersionTaskReferenceSchema
} from './version-material-common'

/**
 * Meeting minutes stored on the plan material (optional schema3 section).
 * The model drafts and updates the body only while `confirmed` is false;
 * confirmation (confirmed/confirmedAt) and each followup's closure mark are
 * human-only and guarded on save. Closure means the plan was revised per that
 * point — never goal attainment or Issue approval, which stay separate human
 * decisions expressed through the archive PR review.
 */
export const PlanMeetingMinutesSchema = z
  .strictObject({
    consensus: z.array(z.string()),
    followups: z.array(
      z.strictObject({
        id: Id,
        text: z.string(),
        closed: z.boolean()
      })
    ),
    confirmed: z.boolean(),
    confirmedAt: z.iso.datetime({ offset: true }).optional(),
    sources: z.string().optional(),
    updatedAt: z.iso.datetime({ offset: true }).optional()
  })
  .superRefine((minutes, context) => {
    const ids = new Set(minutes.followups.map((followup) => followup.id))
    if (ids.size !== minutes.followups.length) {
      context.addIssue({
        code: 'custom',
        message: 'Minutes followup ids must be unique',
        path: ['followups']
      })
    }
  })

export type PlanMeetingMinutes = z.infer<typeof PlanMeetingMinutesSchema>

export const PlanningMaterialSchema = z
  .strictObject({
    ...Identity,
    summary: z.strictObject({
      progress: z.string(),
      risks: z.string(),
      progressSource: PlanningProgressSourceSchema.optional()
    }),
    goals: z.array(VersionGoalSchema),
    tasks: z.array(VersionTaskReferenceSchema),
    minutes: PlanMeetingMinutesSchema.optional(),
    // Session-model-written SOP progress; absent means not started. Lamps only
    // compare positions against it — never a completion authority by itself.
    workflow: PlanWorkflowStateSchema.optional()
  })
  .superRefine((document, context) => {
    const ids = new Set(document.goals.map((goal) => goal.goalId))
    if (ids.size !== document.goals.length) {
      context.addIssue({ code: 'custom', message: 'Goal ids must be unique', path: ['goals'] })
    }
    document.tasks.forEach((task, index) => {
      if (task.goalId && !ids.has(task.goalId)) {
        context.addIssue({
          code: 'custom',
          message: 'Task refers to an unknown goal',
          path: ['tasks', index, 'goalId']
        })
      }
    })
  })

export type PlanningMaterial = z.infer<typeof PlanningMaterialSchema>
