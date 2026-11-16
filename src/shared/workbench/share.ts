import { z } from 'zod'

/** Matches `BW_SHARE_MAX_BYTES` on the self-hosted service; larger content is rejected before upload. */
export const SHARE_MAX_CONTENT_BYTES = 10 * 1024 * 1024

/** Transport-level refusal the service reports as `too_large`; kept for error mapping. */
export const SHARE_TOO_LARGE_MESSAGE = 'This file is too large to share (limit 10 MiB).'

export const ShareSourceSchema = z.object({ sourceKey: z.string().min(1).max(8192) }).strict()

export const SharePublishSchema = z
  .object({
    sourceKey: z.string().min(1).max(8192),
    content: z.string().min(1),
    fileName: z.string().min(1).max(255),
    title: z.string().max(200).optional()
  })
  .strict()

export const ShareConfigSaveSchema = z
  .object({
    serverUrl: z.string().max(2048),
    // Omitted keeps the stored token; an empty string clears it.
    uploadToken: z.string().max(4096).optional()
  })
  .strict()

export const ShareConfigTestSchema = z
  .object({
    serverUrl: z.string().max(2048),
    uploadToken: z.string().max(4096).optional()
  })
  .strict()

export type ShareConfigView = {
  serverUrl: string
  uploadTokenSet: boolean
  configured: boolean
}

export type ShareRecordView = {
  id: string
  url: string
  expiresAt: string
  updatedAt: string
}

export type SharePublishResult = ShareRecordView & {
  change: 'created' | 'updated'
}

export type ShareResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ShareErrorCode; message: string } }

export type ShareErrorCode =
  | 'not-configured'
  | 'invalid-config'
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
