import { getMainHttpClient } from '../network/http-client'
import { abortSignalWithTimeout } from '../lib/abort-signal-with-timeout'
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
  const res = await getMainHttpClient().fetch(url, {
    // Do not follow dashboard redirects with account credentials. Only an
    // explicit 401 identifies a stale session; other HTTP failures stay unknown.
    redirect: 'manual',
    credentials: 'omit',
    headers: {
      ...requestHeaders(session),
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
    },
    ...(method === 'POST' ? { method, body: '{}' } : {}),
    signal: abortSignalWithTimeout(signal, API_TIMEOUT_MS)
  })
  if (res.status === 401) {
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
    const nowMs = Date.now()
    const retryAfterMs = parseUsageRetryAfterMs(res.headers.get('retry-after'), nowMs)
    return {
      kind: 'result',
      result: cursorUsageResult('error', 'Cursor usage is rate limited right now', {
        usageMetadata: {
          source,
          credentialSource: session.source,
          authProvenance: provenance,
          failureKind: 'rate-limited',
          ...(retryAfterMs !== null
            ? { retryAtMs: nowMs + retryAfterMs }
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
