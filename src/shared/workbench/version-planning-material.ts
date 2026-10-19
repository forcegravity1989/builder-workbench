import { z } from 'zod'
import { PlanWorkflowStateSchema } from './version-workflow'
import {
  Identity,
  PlanningProgressSourceSchema,
  VersionGoalSchema,
  VersionTaskReferenceSchema
} from './version-material-common'

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
