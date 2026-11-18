import { z } from 'zod'

/** Matches `BW_SHARE_MAX_BYTES` on the self-hosted service; larger content is rejected before upload. */
export const SHARE_MAX_CONTENT_BYTES = 10 * 1024 * 1024

/** Transport-level refusal the service reports as `too_large`; kept for error mapping. */
export const SHARE_TOO_LARGE_MESSAGE = 'This file is too large to share (limit 10 MiB).'

export const ShareSourceSchema = z.object({ sourceKey: z.string().min(1).max(8192) }).strict()

export const ShareListSchema = z.object({}).strict()

export const SharePublishSchema = z
  .object({
    sourceKey: z.string().min(1).max(8192),
    content: z.string().min(1),
    fileName: z.string().min(1).max(255),
    title: z.string().max(200).optional()
  })
  .strict()

export type ShareRecordView = {
  id: string
  url: string
  expiresAt: string
  updatedAt: string
}

export type SharePublishResult = ShareRecordView & {
  change: 'created' | 'updated'
}

/** One link this machine created; `sourceKey` is the file it was shared from. */
export type ShareListEntry = ShareRecordView & { sourceKey: string }

export type ShareResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ShareErrorCode; message: string } }

export type ShareErrorCode =
  | 'unauthorized'
  /** The service refused the record's edit token; the link cannot be updated from this device. */
  | 'forbidden'
  | 'too-large'
  | 'rate-limited'
  | 'busy'
  | 'not-found'
  | 'unsupported'
  | 'network'
  | 'server'
  | 'unknown'

export function shareContentByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength
}
