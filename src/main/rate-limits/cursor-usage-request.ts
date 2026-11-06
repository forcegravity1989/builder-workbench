import { net } from 'electron'
import { parseUsageRetryAfterMs } from './usage-retry-after'
import type { ProviderRateLimits, UsageRateLimitSource } from '../../shared/rate-limit-types'
import type { CursorAuthSession } from './cursor-auth'
import { cursorSessionCookie } from './cursor-session-token'
import { cursorSessionProvenance } from './cursor-usage-account-policy'

const DASHBOARD_ORIGIN = 'https://cursor.com'
const API_TIMEOUT_MS = 10_000
const EXPIRED_MESSAGE = 'Cursor sign-in expired — sign in with Cursor IDE or run cursor-agent login'

function usageSource(session: CursorAuthSession): UsageRateLimitSource {
  return session.source === 'desktop' ? 'web' : 'cli'
}

export function cursorUsageResult(
  status: ProviderRateLimits['status'],
  error: string | null,
  extra: Partial<ProviderRateLimits> = {}
): ProviderRateLimits {
  return {
    provider: 'cursor',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error,
    status,
    ...extra
  }
}

/**
 * Dashboard routes answer 403 to a bare session cookie — they check the request
 * origin as CSRF defence. Sending what the dashboard itself sends is what they
 * expect; without these headers every /api route fails on a valid session.
 */
function requestHeaders(session: CursorAuthSession): Record<string, string> {
  return {
    Cookie: cursorSessionCookie(session.token),
    Accept: 'application/json',
    Origin: DASHBOARD_ORIGIN,
    Referer: `${DASHBOARD_ORIGIN}/dashboard`
  }
}

export type FetchOutcome =
  | { kind: 'data'; data: unknown }
  | { kind: 'result'; result: ProviderRateLimits; httpStatus?: number }

export async function fetchDashboardJson(
  url: string,
  session: CursorAuthSession,
  signal?: AbortSignal,
  method: 'GET' | 'POST' = 'GET'
): Promise<FetchOutcome> {
  const source = usageSource(session)
  // Why on failures too: the account-switch guard downstream can only drop a
  // previous account's figures when the fresh result names an account, and a
  // switch whose first refresh 401s or 5xxs is exactly when it must.
  const provenance = cursorSessionProvenance(session)
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)])
    : AbortSignal.timeout(API_TIMEOUT_MS)
  const res = await net.fetch(url, {
    // Why manual: the dashboard bounces an unusable session to /login, and
    // 'error' would surface that as a generic network failure instead of the
    // actionable sign-in message below.
    redirect: 'manual',
    credentials: 'omit',
    headers: {
      ...requestHeaders(session),
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
    },
    ...(method === 'POST' ? { method, body: '{}' } : {}),
    signal: requestSignal
  })
  if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
    return {
      kind: 'result',
      result: cursorUsageResult('error', EXPIRED_MESSAGE, {
        usageMetadata: {
          source,
          credentialSource: session.source,
          authProvenance: provenance,
          failureKind: 'stale-token'
        }
      })
    }
  }
  if (res.status === 429) {
    const retryAfterMs = parseUsageRetryAfterMs(res.headers.get('retry-after'))
    return {
      kind: 'result',
      result: cursorUsageResult('error', 'Cursor usage is rate limited right now', {
        usageMetadata: {
          source,
          credentialSource: session.source,
          authProvenance: provenance,
          failureKind: 'rate-limited',
          ...(retryAfterMs !== null
            ? { retryAtMs: Date.now() + retryAfterMs }
            : {})
        }
      })
    }
  }
  if (!res.ok) {
    return {
      kind: 'result',
      httpStatus: res.status,
      result: cursorUsageResult('error', `Cursor usage request failed (HTTP ${res.status})`, {
        usageMetadata: {
          source,
          credentialSource: session.source,
          authProvenance: provenance,
          failureKind: 'server'
        }
      })
    }
  }
  try {
    return { kind: 'data', data: await res.json() }
  } catch {
    return {
      kind: 'result',
      result: cursorUsageResult('error', 'Cursor usage response could not be parsed', {
        usageMetadata: {
          source,
          credentialSource: session.source,
          authProvenance: provenance,
          failureKind: 'parse'
        }
      })
    }
  }
}
