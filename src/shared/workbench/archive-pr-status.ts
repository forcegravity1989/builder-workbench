import { z } from 'zod'
import { WorkflowArchivePrSchema } from './version-workflow'

/**
 * Thin PR/MR status read for the archive row, keyed by the model-recorded
 * reference — no byte proof, no branch-name probing, no revision matching.
 * This read only marks whether the recorded archive PR is merged; the boards
 * render it as text and derive no lamp from it (journey lamps are retired).
 * Unreadable stays unknown.
 */
export const ArchivePrStatusRequestSchema = z.strictObject({
  repoId: z.string().min(1),
  worktreeId: z.string().min(1),
  hostId: z.string().min(1),
  pr: WorkflowArchivePrSchema
})
export type ArchivePrStatusRequest = z.infer<typeof ArchivePrStatusRequestSchema>

const Checked = z.strictObject({
  url: z.string().min(1).optional(),
  checkedAt: z.iso.datetime({ offset: true })
})
export const ArchivePrStatusResultSchema = z.union([
  z.strictObject({ state: z.literal('merged'), ...Checked.shape }),
  z.strictObject({ state: z.literal('open'), ...Checked.shape }),
  z.strictObject({ state: z.literal('closed'), ...Checked.shape }),
  z.strictObject({ state: z.literal('unknown'), reason: z.string().min(1) })
])
export type ArchivePrStatusResult = z.infer<typeof ArchivePrStatusResultSchema>
