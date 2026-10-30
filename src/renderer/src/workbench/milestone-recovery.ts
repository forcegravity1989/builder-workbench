import { z } from 'zod'
import {
  MilestoneFeatureSchema,
  MilestoneDeliverySchema,
  ScheduledVersionSchema
} from '../../../shared/workbench/project-milestones'
import type { Session } from './milestone-planning-session'

// Recovery accepts unfinished fields; submission still validates the business material schema.
const draftSchema = z.strictObject({
  material: z.strictObject({
    schema_version: z.literal(2),
    months: z
      .array(
        z.strictObject({
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          outcome: z.string()
        })
      )
      .max(240),
    features: z.array(
      MilestoneFeatureSchema.extend({
        title: z.string(),
        owner: z.string(),
        deliveries: z.array(
          MilestoneDeliverySchema.extend({
            version: z.strictObject({ version: z.string(), cycleId: z.string().min(1) })
          })
        )
      })
    )
  }),
  versions: z.array(ScheduledVersionSchema.extend({ version: z.string() }))
})
export const milestoneRecoverySchema = z.strictObject({
  schema_version: z.literal(1),
  draft: draftSchema,
  baseline: draftSchema,
  expectedFormal: z.string().min(1),
  expectedProposal: z.string().nullable(),
  editing: z.boolean(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  scrollX: z.number().finite().nonnegative().nullable(),
  scrollY: z.number().finite().nonnegative(),
  pageY: z.number().finite().nonnegative(),
  retry: z.boolean(),
  submitError: z.string().optional()
})
export function milestoneRecoveryPayload(value: Session): string {
  const {
    draft,
    baseline,
    expectedFormal,
    expectedProposal,
    editing,
    month,
    scrollX,
    scrollY,
    pageY,
    retry,
    submitError
  } = value
  return JSON.stringify({
    schema_version: 1,
    draft,
    baseline,
    expectedFormal,
    expectedProposal,
    editing,
    month,
    scrollX,
    scrollY,
    pageY,
    retry,
    submitError
  })
}
