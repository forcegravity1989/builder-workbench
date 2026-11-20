import type { z } from 'zod'
import { ArchivePrStatusRequestSchema } from './archive-pr-status'

// Provider reads authorize the referenced registered repo; no version worktree is created.
export const WorkflowCommentsRequestSchema = ArchivePrStatusRequestSchema.omit({ worktreeId: true })
export type WorkflowCommentsRequest = z.infer<typeof WorkflowCommentsRequestSchema>
