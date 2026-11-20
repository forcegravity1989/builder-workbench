import { z } from 'zod'
import { BrowserTarget } from '../rpc-contract/rpc-param-primitives'

export const PrototypeReviewAnnotationSchema = z.object({
  id: z.string().min(1),
  pageId: z.string().min(1),
  documentKey: z.string().min(1),
  comment: z.string().trim().min(1).max(4000),
  x: z.number().finite(),
  y: z.number().finite(),
  label: z.string().max(500).optional(),
  author: z.string().min(1).max(100),
  host: z.string().min(1).max(200),
  createdAt: z.string().datetime()
})
export type PrototypeReviewAnnotation = z.infer<typeof PrototypeReviewAnnotationSchema>

/** Keep in-page fragment navigation in the same annotation document. */
export function canonicalPrototypeReviewDocumentKey(value: string): string {
  const hashIndex = value.indexOf('#')
  return (hashIndex !== -1 ? value.slice(0, hashIndex) : value) || 'about:blank'
}

const PrototypeReviewAnnotationTarget = BrowserTarget.extend({
  worktree: z.string().min(1),
  page: z.string().min(1)
})

export const PrototypeReviewAnnotationListSchema = PrototypeReviewAnnotationTarget.extend({
  documentKey: z.string().min(1)
})

export const PrototypeReviewAnnotationAddSchema = PrototypeReviewAnnotationTarget.extend({
  id: z.string().min(1).max(200).optional(),
  documentKey: z.string().min(1),
  comment: z.string().trim().min(1).max(4000),
  x: z.number().finite(),
  y: z.number().finite(),
  label: z.string().max(500).optional(),
  hostName: z.string().trim().min(1).max(200).optional()
})

export const PrototypeReviewAnnotationDeleteSchema = z.object({
  pageId: z.string().min(1),
  documentKey: z.string().min(1),
  annotationId: z.string().min(1)
})
