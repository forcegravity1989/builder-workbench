import { z } from 'zod'
import { WorkflowReleaseRefSchema } from './version-workflow'

/**
 * Thin release status read for the acceptance board's release row, keyed by the
 * model-recorded tag reference — one provider read, no second source of truth:
 * published time, Release URL and assets stay provider-computed on every read
 * and never enter the material. A recorded tag with no matching Release is a
 * real reading (missing), not an unknown; unreadable providers and failed
 * reads stay unknown instead of feigning a state.
 */
export const ReleaseStatusRequestSchema = z.strictObject({
  repoId: z.string().min(1),
  worktreeId: z.string().min(1),
  hostId: z.string().min(1),
  release: WorkflowReleaseRefSchema
})
export type ReleaseStatusRequest = z.infer<typeof ReleaseStatusRequestSchema>

export const ReleaseStatusResultSchema = z.union([
  z.strictObject({
    state: z.literal('published'),
    publishedAt: z.iso.datetime({ offset: true }),
    url: z.string().min(1),
    assets: z.array(z.string().min(1)),
    checkedAt: z.iso.datetime({ offset: true })
  }),
  z.strictObject({
    state: z.literal('missing'),
    checkedAt: z.iso.datetime({ offset: true })
  }),
  z.strictObject({ state: z.literal('unknown'), reason: z.string().min(1) })
])
export type ReleaseStatusResult = z.infer<typeof ReleaseStatusResultSchema>
