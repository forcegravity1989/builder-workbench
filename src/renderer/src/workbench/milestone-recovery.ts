import { z } from 'zod'
import {
  MilestoneFeatureSchema,
  ScheduledVersionSchema,
  type MilestoneDraft
} from '../../../shared/workbench/project-milestones'

// Recovery must accept unfinished fields; submission still validates the business material schema.
const draftSchema = z.strictObject({
  material: z.strictObject({
    schema_version: z.literal(1),
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
        pre: z.strictObject({ version: z.string(), cycleId: z.string().min(1) }).nullable(),
        release: z.strictObject({ version: z.string(), cycleId: z.string().min(1) }).nullable()
      })
    )
  }),
  versions: z.array(ScheduledVersionSchema.extend({ version: z.string() }))
})
const recoverySchema = z.strictObject({
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
export type MilestoneRecovery = z.infer<typeof recoverySchema>
export const milestoneRecoveryKey = (scope: string) => `workbench.milestones.draft:${scope}`
export function parseMilestoneRecovery(raw: string): MilestoneRecovery {
  return recoverySchema.parse(JSON.parse(raw))
}
export function milestoneRecoveryValue(value: {
  draft: MilestoneDraft
  baseline: MilestoneDraft
  expectedFormal: string
  expectedProposal: string | null
  editing: boolean
  month: string
  scrollX: number | null
  scrollY: number
  pageY: number
  retry: boolean
  submitError?: string
}): MilestoneRecovery {
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
  return {
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
  }
}
