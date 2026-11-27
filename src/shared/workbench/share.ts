import { z } from 'zod'
import { ARTIFACT_MAX_CONTENT_BYTES } from '../artifacts/artifacts'

/**
 * The service's per-share cap (`BW_SHARE_MAX_BYTES`). Aliased from the artifact contract so there is
 * one number to change; larger content is rejected before it reaches the network.
 */
export const SHARE_MAX_CONTENT_BYTES = ARTIFACT_MAX_CONTENT_BYTES

export const ShareSourceSchema = z.object({ sourceKey: z.string().min(1).max(8192) }).strict()

export const ShareListSchema = z.object({}).strict()

/**
 * The service answers 400 when a name carries a control character (`services/bw-share/src/payload.mjs`),
 * and it refuses the whole upload for it — so reject that here, where the message can name the file.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32 || code === 127) {
      return true
    }
  }
  return false
}

const PRINTABLE_NAME_MESSAGE = 'must not contain control characters'

export const SharePublishSchema = z
  .object({
    sourceKey: z.string().min(1).max(8192),
    content: z.string().min(1),
    fileName: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !hasControlCharacter(value), `fileName ${PRINTABLE_NAME_MESSAGE}`),
    title: z
      .string()
      .max(200)
      .refine((value) => !hasControlCharacter(value), `title ${PRINTABLE_NAME_MESSAGE}`)
      .optional()
  })
  .strict()

export type ShareRecordView = {
  id: string
  url: string
  /** Empty when the service keeps links forever (`BW_SHARE_RETENTION_DAYS=0`). */
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
  /**
   * The record's edit token no longer matches the link, so the host dropped the record: the row is
   * gone from this machine, but the public link may still work until an operator deletes it.
   */
  | 'stale-record'
  | 'too-large'
  | 'rate-limited'
  | 'busy'
  /** The service's device-token registry is full; only an operator can clear it. */
  | 'enrollment-full'
  /** The service could not read its device-token registry and refuses new shares. */
  | 'registry-unavailable'
  /** This machine's own record index could not be read, so the list is not trustworthy. */
  | 'records-unreadable'
  | 'not-found'
  | 'unsupported'
  | 'network'
  | 'server'
  | 'unknown'

export function shareContentByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength
}
