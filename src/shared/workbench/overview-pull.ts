import { z } from 'zod'

/** A BW projection of provider metadata, without the native review page's files/checks. */
export const OverviewPullSchema = z.strictObject({
  number: z.number().int().positive(),
  url: z.url(),
  title: z.string(),
  body: z.string(),
  state: z.enum(['open', 'closed', 'merged', 'draft']),
  createdAt: z.iso.datetime().optional(),
  mergedAt: z.iso.datetime().optional(),
  revision: z.string().optional(),
  readAt: z.iso.datetime()
})
export type OverviewPull = z.infer<typeof OverviewPullSchema>
