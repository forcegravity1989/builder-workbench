import { z } from 'zod'
import { PlanWorkflowStateSchema } from './version-workflow'
import { VersionTimeWindowSchema } from './version-time-window'
import {
  Id,
  Identity,
  materialObject,
  PlanningProgressSourceSchema,
  VersionGoalSchema,
  VersionTaskReferenceSchema
} from './version-material-common'

/**
 * Meeting minutes stored on the plan material (optional schema3 section).
 * The model drafts and updates the body only while `confirmed` is false;
 * confirmation (confirmed/confirmedAt) is human-only and guarded on save.
 * Stored closure marks remain protected for existing materials; the current
 * UI records a followup's resolution or tracking Issue in its text.
 */
export const PlanMeetingMinutesSchema = materialObject({
    consensus: z.array(z.string()),
    followups: z.array(
      materialObject({
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

export const PlanningMaterialSchema = materialObject({
    ...Identity,
    timeWindow: VersionTimeWindowSchema.optional(),
    summary: materialObject({
      progress: z.string(),
      risks: z.string(),
      progressSource: PlanningProgressSourceSchema.optional()
    }),
    goals: z.array(VersionGoalSchema),
    // Retain the legacy field for existing material revisions.
    tasks: z.array(VersionTaskReferenceSchema).default([]),
    minutes: PlanMeetingMinutesSchema.optional(),
    // Optional progress recorded by the planning assistant.
    workflow: PlanWorkflowStateSchema.optional()
  })
  .superRefine((document, context) => {
    const ids = new Set(document.goals.map((goal) => goal.goalId))
    if (ids.size !== document.goals.length) {
      context.addIssue({ code: 'custom', message: 'Goal ids must be unique', path: ['goals'] })
    }
    for (const field of [
      'planRef',
      'candidateRef',
      'preparedArtifacts',
      'demoEnv',
      'meeting',
      'preparationReview',
      'taskSnapshot',
      'results'
    ]) {
      if (Object.hasOwn(document, field)) {
        context.addIssue({
          code: 'custom',
          message: `Planning material cannot carry acceptance field ${field}`,
          path: [field]
        })
      }
    }
  })

export type PlanningMaterial = z.infer<typeof PlanningMaterialSchema>
