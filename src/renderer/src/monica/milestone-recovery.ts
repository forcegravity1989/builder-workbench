import { z } from 'zod'
import {
  MilestoneFeatureSchema,
  MilestoneNodeSchema,
  upgradeMilestoneMaterial,
  ScheduledVersionSchema
} from '../../../shared/monica/project-milestones'
import { MilestoneRecoveryRecordSchema } from '../../../shared/monica/milestone-recovery'

// Recovery accepts unfinished fields; submission still validates the business material schema.
const draftSchema = z.strictObject({
  material: z.preprocess(
    upgradeMilestoneMaterial,
    z.strictObject({
      schema_version: z.literal(4),
      milestones: z.array(MilestoneNodeSchema).max(2000),
      features: z.array(
        MilestoneFeatureSchema.extend({
          title: z.string(),
          owner: z.string()
        })
      )
    })
  ),
  versions: z.array(ScheduledVersionSchema.extend({ version: z.string() }))
})
const milestoneRecoverySchema = z.object({
  schema_version: z.literal(1),
  draft: draftSchema,
  baseline: draftSchema
})
export type LegacyMilestoneDraft = z.infer<typeof milestoneRecoverySchema> & { revision: string }

export async function readLegacyMilestoneDraft(
  key: string
): Promise<LegacyMilestoneDraft | undefined> {
  const { payload, revision } = MilestoneRecoveryRecordSchema.parse(
    await window.api.milestoneRecovery.read(key)
  )
  if (!payload || !revision || localStorage.getItem(`bw:milestone-restored:${key}`) === revision) {
    return undefined
  }
  const record = milestoneRecoverySchema.parse(JSON.parse(payload))
  return JSON.stringify(record.draft) === JSON.stringify(record.baseline)
    ? undefined
    : { ...record, revision }
}
