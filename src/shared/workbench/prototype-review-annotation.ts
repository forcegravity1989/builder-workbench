import { z } from 'zod'
import type { BrowserAnnotationPayload } from '../browser/element-grab/browser-grab-types'

// A reviewer annotates a copy of the prototype in their own browser tab. Submitting hands those
// notes to the document's owner; the owner's host keeps them per document until the owner has
// pulled them into their own tab. Element context travels with the note, screenshots do not.
const MAX_PAYLOAD_JSON_LENGTH = 32 * 1024

// Why: the owner's tray and the page overlay read both rects of a note, so a note without them would break the owner's view until it is deleted.
function isRect(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const rect = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every(
    (key) => typeof rect[key] === 'number' && Number.isFinite(rect[key])
  )
}

function isAnnotationPayload(value: unknown): value is BrowserAnnotationPayload {
  if (!value || typeof value !== 'object') {
    return false
  }
  const payload = value as Partial<Record<keyof BrowserAnnotationPayload, unknown>>
  const target = payload.target as
    | { selector?: unknown; rectPage?: unknown; rectViewport?: unknown }
    | null
    | undefined
  return (
    payload.screenshot === null &&
    typeof payload.page === 'object' &&
    payload.page !== null &&
    typeof target === 'object' &&
    target !== null &&
    typeof target.selector === 'string' &&
    isRect(target.rectPage) &&
    isRect(target.rectViewport) &&
    JSON.stringify(value).length <= MAX_PAYLOAD_JSON_LENGTH
  )
}

const AnnotationPayloadSchema = z.custom<BrowserAnnotationPayload>(isAnnotationPayload, {
  message: 'Invalid annotation payload'
})

const AnnotationFields = {
  documentKey: z.string().min(1).max(2000),
  comment: z.string().trim().min(1).max(4000),
  intent: z.enum(['fix', 'change', 'question', 'approve']),
  priority: z.enum(['blocking', 'important', 'suggestion']),
  payload: AnnotationPayloadSchema
}

export const PrototypeReviewAnnotationSchema = z.object({
  id: z.string().min(1).max(200),
  ...AnnotationFields,
  author: z.string().min(1).max(100),
  host: z.string().min(1).max(200),
  createdAt: z.string().datetime()
})
export type PrototypeReviewAnnotation = z.infer<typeof PrototypeReviewAnnotationSchema>

export const PrototypeReviewAnnotationListSchema = z.object({
  documentKey: AnnotationFields.documentKey
})

export const PrototypeReviewAnnotationAddSchema = z.object({
  id: z.string().min(1).max(200),
  ...AnnotationFields,
  hostName: z.string().trim().min(1).max(200).optional(),
  /** Honoured only for the host's own app; a remote member is always named by the host. */
  author: z.string().trim().min(1).max(100).optional()
})

export const PrototypeReviewAnnotationDeleteSchema = z.object({
  documentKey: AnnotationFields.documentKey,
  annotationId: z.string().min(1)
})
