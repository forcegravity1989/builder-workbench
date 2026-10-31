import { z } from 'zod'
import { WorkflowArchivePrSchema } from './version-workflow'

/**
 * Thin PR/MR status read for the archive row, keyed by the model-recorded
 * reference — no byte proof, no branch-name probing, no revision matching.
 * Merge time is provider-reported evidence; it does not decide goal completion.
 * Unreadable stays unknown.
 */
export const ArchivePrStatusRequestSchema = z.strictObject({
  repoId: z.string().min(1),
  worktreeId: z.string().min(1),
  hostId: z.string().min(1),
  pr: WorkflowArchivePrSchema,
  force: z.boolean().optional()
})
export type ArchivePrStatusRequest = z.infer<typeof ArchivePrStatusRequestSchema>

const Checked = z.strictObject({
  url: z.string().min(1).optional(),
  checkedAt: z.iso.datetime({ offset: true }),
  mergedAt: z.iso.datetime({ offset: true }).optional()
})
export const ArchivePrStatusResultSchema = z.union([
  z.strictObject({ state: z.literal('merged'), ...Checked.shape }),
  z.strictObject({ state: z.literal('open'), ...Checked.shape }),
  z.strictObject({ state: z.literal('closed'), ...Checked.shape }),
  z.strictObject({
    state: z.literal('unknown'),
    reason: z.string().min(1),
    url: z.string().min(1).optional()
  })
])
export type ArchivePrStatusResult = z.infer<typeof ArchivePrStatusResultSchema>
