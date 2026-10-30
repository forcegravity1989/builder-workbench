import { z } from 'zod'

export const MilestoneRecoveryKeySchema = z.string().min(1).max(4096)
export const MilestoneRecoveryRecordSchema = z.strictObject({
  revision: z.string().uuid().nullable(),
  payload: z
    .string()
    .max(8 * 1024 * 1024)
    .nullable()
})
export const MilestoneRecoveryWriteSchema = z.strictObject({
  key: MilestoneRecoveryKeySchema,
  expectedRevision: z.string().uuid().nullable(),
  payload: MilestoneRecoveryRecordSchema.shape.payload
})
export type MilestoneRecoveryRecord = z.infer<typeof MilestoneRecoveryRecordSchema>
export type MilestoneRecoveryWrite = z.infer<typeof MilestoneRecoveryWriteSchema>
export type MilestoneRecoveryApi = {
  read(key: string): Promise<MilestoneRecoveryRecord>
  write(request: MilestoneRecoveryWrite): Promise<MilestoneRecoveryRecord>
}
