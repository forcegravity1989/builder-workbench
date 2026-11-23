import { cursorSessionProvenance } from './cursor-usage-account-policy'
import {
  fetchDashboardJson,
  cursorUsageResult as result,
  type FetchOutcome
} from './cursor-usage-request'
import type { ProviderRateLimits, UsageRateLimitSource } from '../../shared/rate-limit-types'
import {
  readCursorAuthSession,
  type CursorAuthReadResult,
  type CursorAuthSession
} from './cursor-auth'
import { isCursorSessionTokenExpired } from './cursor-session-token'
import {
  mapCursorCurrentPeriodUsage,
  type CursorCurrentPeriodUsage,
  mapCursorLegacyRequestQuota,
  mapCursorUsageSummary,
  parseCursorUsageSummary
} from './cursor-usage-mapping'
import { CURSOR_ON_DEMAND_BUCKET_NAME } from '../../shared/cursor-usage-buckets'

const DASHBOARD_ORIGIN = 'https://cursor.com'
const USAGE_SUMMARY_URL = `${DASHBOARD_ORIGIN}/api/usage-summary`
const CURRENT_PERIOD_USAGE_URL = `${DASHBOARD_ORIGIN}/api/dashboard/get-current-period-usage`
const LEGACY_USAGE_URL = `${DASHBOARD_ORIGIN}/api/usage`
const SUB_MONTHLY_PERIOD_MINUTES = 27 * 24 * 60

const SIGNED_OUT_MESSAGE =
  'No Cursor sign-in on this computer — sign in with Cursor IDE or `cursor-agent login`'
const EXPIRED_MESSAGE = 'Cursor sign-in expired — sign in with Cursor IDE or run cursor-agent login'

function usageSource(session: CursorAuthSession): UsageRateLimitSource {
  return session.source === 'desktop' ? 'web' : 'cli'
}

type CurrentPeriodOutcome =
  | { kind: 'usage'; usage: CursorCurrentPeriodUsage }
  | { kind: 'result'; result: ProviderRateLimits }
  | { kind: 'summary' }

/** Unified plans trust the period strictly; other plans only use it when Cursor reports a sub-monthly period. */
async function fetchCurrentPeriodUsage(
  session: CursorAuthSession,
  signal: AbortSignal | undefined,
  unified: boolean
): Promise<CurrentPeriodOutcome> {
  let current: FetchOutcome
  try {
    current = await fetchDashboardJson(CURRENT_PERIOD_USAGE_URL, session, signal, 'POST')
  } catch (error) {
    if (unified) {
      throw error
    }
    return { kind: 'summary' }
  }
  if (current.kind === 'result') {
    // Why: only a retired endpoint falls back (Cursor serves unknown dashboard routes as
    // 200 HTML); other failures must not publish obsolete zeros as healthy usage.
    const retired =
      [404, 405, 501].includes(current.httpStatus ?? 0) ||
      current.result.usageMetadata?.failureKind === 'parse'
    return unified && !retired ? { kind: 'result', result: current.result } : { kind: 'summary' }
  }
  const usage = mapCursorCurrentPeriodUsage(current.data)
  return usage && (unified || usage.periodMinutes < SUB_MONTHLY_PERIOD_MINUTES)
    ? { kind: 'usage', usage }
    : { kind: 'summary' }
}

function credentialFailure(readResult: CursorAuthReadResult): ProviderRateLimits | null {
  if (readResult.status === 'missing') {
    return result('unavailable', SIGNED_OUT_MESSAGE, {
      usageMetadata: { failureKind: 'missing-credentials' }
    })
  }
  if (readResult.status === 'error') {
    return result('error', readResult.error, {
      usageMetadata: { failureKind: 'missing-credentials' }
    })
  }
  // Why: cursor-agent refreshes its own token on use; Orca only reads, so a
  // lapsed session is reported instead of spending a request that must 401.
  if (isCursorSessionTokenExpired(readResult.session.token)) {
    return result('error', EXPIRED_MESSAGE, {
      usageMetadata: {
        source: usageSource(readResult.session),
        credentialSource: readResult.session.source,
        authProvenance: cursorSessionProvenance(readResult.session),
        failureKind: 'stale-token'
      }
    })
  }
  return null
}

/**
 * Reads the Cursor plan allowance for the account this machine is signed into.
 * Orca never runs `cursor-agent login` and never writes Cursor's credentials.
 */
export async function fetchCursorRateLimits(
  options: { signal?: AbortSignal; authReadResult?: CursorAuthReadResult } = {}
): Promise<ProviderRateLimits> {
  const readResult = options.authReadResult ?? (await readCursorAuthSession())
  const failure = credentialFailure(readResult)
  if (failure || readResult.status !== 'ok') {
    return failure ?? result('unavailable', SIGNED_OUT_MESSAGE)
  }
  const session = readResult.session
  const source = usageSource(session)
  const metadata = {
    source,
    credentialSource: session.source,
    authProvenance: cursorSessionProvenance(session)
  }

  try {
    const outcome = await fetchDashboardJson(USAGE_SUMMARY_URL, session, options.signal)
    if (outcome.kind === 'result') {
      return outcome.result
    }
    const mapped = mapCursorUsageSummary(parseCursorUsageSummary(outcome.data))

    const unified = mapped.planType?.startsWith('unified_') === true
    const planPools = mapped.buckets.filter((bucket) => bucket.name !== CURSOR_ON_DEMAND_BUCKET_NAME)
    // Why: weekly plans keep obsolete monthly zeros in the summary, so only idle pools justify a request.
    // Unlimited non-unified plans keep main's no-bar result without the extra request.
    const summaryPoolsIdle =
      !mapped.isUnlimited &&
      planPools.length > 0 &&
      planPools.every((bucket) => bucket.usedPercent === 0)
    if (unified || summaryPoolsIdle) {
      const current = await fetchCurrentPeriodUsage(session, options.signal, unified)
      if (current.kind === 'result') {
        return current.result
      }
      if (current.kind === 'usage') {
        const period = current.usage
        return result('ok', null, {
          ...(period.monthly ? { monthly: period.monthly } : {}),
          buckets: [
            ...period.buckets,
            ...mapped.buckets.filter((bucket) => bucket.name === CURSOR_ON_DEMAND_BUCKET_NAME)
          ],
          planType: mapped.planType,
          usageMetadata: metadata
        })
      }
    }

    // Why: an unlimited plan has no ceiling to divide by. Publish the plan so the
    // roster still lists the account, with no misleading bar.
    if (mapped.isUnlimited) {
      return result('ok', null, { planType: mapped.planType, usageMetadata: metadata })
    }
    if (mapped.monthly || mapped.buckets.length > 0) {
      return result('ok', null, {
        ...(mapped.monthly ? { monthly: mapped.monthly } : {}),
        ...(mapped.buckets.length > 0 ? { buckets: mapped.buckets } : {}),
        planType: mapped.planType,
        usageMetadata: metadata
      })
    }

    // Why: accounts still on request-quota billing report nothing under
    // individualUsage, so try the older per-model endpoint before concluding
    // the account has no visible quota.
    const legacy = await fetchDashboardJson(
      `${LEGACY_USAGE_URL}?user=${encodeURIComponent(session.token.subject)}`,
      session,
      options.signal
    )
    if (legacy.kind === 'result') {
      return legacy.result
    }
    const legacyWindow = mapCursorLegacyRequestQuota(legacy.data)
    if (legacyWindow) {
      return result('ok', null, {
        monthly: legacyWindow,
        planType: mapped.planType,
        usageMetadata: metadata
      })
    }

    // Why: a 200 with no allowance means the plan exposes no quota (API-key or
    // team-billed accounts). 'unavailable' hides the bar the way Claude does on
    // API-key billing; 'error' would paint a permanent alert for a healthy account.
    return result('unavailable', 'Cursor reported no usage allowance for this account', {
      planType: mapped.planType,
      usageMetadata: { ...metadata, failureKind: 'usage-unavailable' }
    })
  } catch {
    return result('error', 'Cursor usage request failed', {
      usageMetadata: { ...metadata, failureKind: 'network' }
    })
  }
}
