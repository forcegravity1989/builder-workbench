import { createHash } from 'node:crypto'
import type { CursorAuthReadResult, CursorAuthSession } from './cursor-auth'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'

/** A failed credential read cannot prove that the previous account is still selected. */
export function previousCursorUsageForAccount(
  provenance: string | null | undefined,
  previous: ProviderRateLimits | null
): ProviderRateLimits | null {
  return provenance && provenance === previous?.usageMetadata?.authProvenance ? previous : null
}

/** Non-secret account identity shared by the usage snapshot and account pane. */
export function cursorAuthProvenance(auth: CursorAuthReadResult): string | null {
  return auth.status === 'ok' ? cursorSessionProvenance(auth.session) : null
}

export function cursorSessionProvenance(session: CursorAuthSession): string {
  return createHash('sha256').update(session.token.subject).digest('hex').slice(0, 12)
}
