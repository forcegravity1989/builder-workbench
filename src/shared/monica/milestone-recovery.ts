import { z } from 'zod'

export const MilestoneRecoveryKeySchema = z.string().min(1).max(4096)
export const MilestoneRecoveryRecordSchema = z.strictObject({
  revision: z.string().uuid().nullable(),
  payload: z
    .string()
    .max(8 * 1024 * 1024)
    .nullable()
})
export type MilestoneRecoveryRecord = z.infer<typeof MilestoneRecoveryRecordSchema>
export type MilestoneRecoveryApi = {
  read(key: string): Promise<MilestoneRecoveryRecord>
}
