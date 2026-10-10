/**
 * Per-automation webhook credentials: minting and constant-time verification.
 *
 * The token is the whole authorization for the serve-mode trigger endpoint, so
 * comparison must not leak how many leading bytes matched. Length is public
 * knowledge (every minted token shares it); only the bytes are secret.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'

export const AUTOMATION_WEBHOOK_TOKEN_BYTES = 24

/** Opaque, URL-safe, unpadded — safe to paste into a curl header. */
export function generateAutomationWebhookToken(): string {
  return randomBytes(AUTOMATION_WEBHOOK_TOKEN_BYTES).toString('base64url')
}

/** True only when the presented string is byte-identical to the stored token. */
export function isAutomationWebhookTokenMatch(
  expected: string | null | undefined,
  presented: string | undefined
): boolean {
  if (typeof expected !== 'string' || typeof presented !== 'string') {
    return false
  }
  const expectedBytes = Buffer.from(expected, 'utf8')
  const presentedBytes = Buffer.from(presented, 'utf8')
  if (expectedBytes.length !== presentedBytes.length) {
    return false
  }
  return timingSafeEqual(expectedBytes, presentedBytes)
}
