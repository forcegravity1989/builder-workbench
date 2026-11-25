// Why: deployment-driven configuration for the W3 Account web login. Read from
// the environment in the main process. No OAuth client_id / PKCE / client_secret
// is involved — the W3 portal's own account API is polled from the dedicated
// browser session after the user completes the normal W3 login in the window.
export type W3AccountConfig = {
  configured: true
  /** Page the login window loads (the W3 portal). */
  loginUrl: string
  /** W3 account API (trusted w3.huawei.com by default). */
  accountApiUrl: string
  /** Bounded total time to wait for the user to finish login. */
  loginTimeoutMs: number
  /** Login page origin — identity requests only ever go to this origin. */
  loginOrigin: string
  /** Account API origin — must be http(s) with a real host (no userinfo). */
  accountApiOrigin: string
  /** Fixed shortcut opened in the W3 session (w3.huawei.com by default). */
  shortcutUrl: string
  /** Host the shortcut is allowed to target (w3.huawei.com unless configured). */
  shortcutHost: string
}

export type W3AccountConfigResult = W3AccountConfig | { configured: false; reason: 'invalid' }

export const W3_DEFAULT_LOGIN_URL = 'https://w3.huawei.com/next/indexa.html'
export const W3_DEFAULT_SHORTCUT_URL = 'https://w3.huawei.com/next/index_zh.html'
export const W3_TRUSTED_SHORTCUT_HOST = 'w3.huawei.com'
export const W3_DEFAULT_ACCOUNT_API_PATH =
  '/next/service/rest/my/w3account/v1/account/{locale}?profile=1&version=1&usergroup=1'
export const W3_DEFAULT_LOCALE = 'zh'
export const W3_DEFAULT_LOGIN_TIMEOUT_MS = 120_000
const W3_MIN_LOGIN_TIMEOUT_MS = 5_000
const W3_MAX_LOGIN_TIMEOUT_MS = 300_000

/**
 * Accept a trusted http(s) URL: real host, no userinfo, absolute http(s)
 * scheme. This is the "受信域" gate — an arbitrary/untrusted origin is
 * rejected rather than fetched.
 */
function asTrustedHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null
    }
    if (!url.hostname || url.username || url.password) {
      return null
    }
    return url
  } catch {
    return null
  }
}

function parseLoginTimeoutMs(raw: string | undefined): number {
  if (typeof raw !== 'string' || !raw.trim()) {
    return W3_DEFAULT_LOGIN_TIMEOUT_MS
  }
  const value = Number(raw)
  if (
    !Number.isFinite(value) ||
    value < W3_MIN_LOGIN_TIMEOUT_MS ||
    value > W3_MAX_LOGIN_TIMEOUT_MS
  ) {
    return W3_DEFAULT_LOGIN_TIMEOUT_MS
  }
  return Math.round(value)
}

/**
 * Resolve W3 Account config from env (main process only):
 *
 *   ORCA_W3_LOGIN_URL          login page (default https://w3.huawei.com/next/indexa.html)
 *   ORCA_W3_ACCOUNT_API_URL    account API (default w3.huawei.com path with locale)
 *   ORCA_W3_LOCALE             zh | en, spliced into the default API locale
 *   ORCA_W3_LOGIN_TIMEOUT_MS   total login wait (default 120000, clamped 5s–10min)
 *   ORCA_W3_SHORTCUT_URL       "open W3 home" shortcut (default next/index_zh.html;
 *                              its host becomes the only extra trusted shortcut host)
 *
 * Invalid URLs (non-http(s), missing host, userinfo) make the feature
 * report "not configured" instead of touching an untrusted origin.
 */
export function getW3AccountConfig(env: NodeJS.ProcessEnv = process.env): W3AccountConfigResult {
  const rawLogin =
    typeof env.ORCA_W3_LOGIN_URL === 'string' && env.ORCA_W3_LOGIN_URL.trim()
      ? env.ORCA_W3_LOGIN_URL.trim()
      : W3_DEFAULT_LOGIN_URL
  const loginUrl = asTrustedHttpUrl(rawLogin)
  if (!loginUrl) {
    return { configured: false, reason: 'invalid' }
  }

  const rawLocale =
    typeof env.ORCA_W3_LOCALE === 'string' ? env.ORCA_W3_LOCALE.trim().toLowerCase() : ''
  const locale = rawLocale === 'en' ? 'en' : W3_DEFAULT_LOCALE
  const defaultAccountApi = `https://w3.huawei.com${W3_DEFAULT_ACCOUNT_API_PATH.replace(
    '{locale}',
    locale
  )}`
  const rawAccountApi =
    typeof env.ORCA_W3_ACCOUNT_API_URL === 'string' && env.ORCA_W3_ACCOUNT_API_URL.trim()
      ? env.ORCA_W3_ACCOUNT_API_URL.trim()
      : defaultAccountApi
  const accountApiUrl = asTrustedHttpUrl(rawAccountApi)
  if (!accountApiUrl) {
    return { configured: false, reason: 'invalid' }
  }

  // Why: the shortcut is a fixed W3 page, not a user URL box. A configured
  // ORCA_W3_SHORTCUT_URL becomes the explicit trusted host; otherwise only
  // w3.huawei.com is allowed. A malformed override falls back to the default.
  const rawShortcut =
    typeof env.ORCA_W3_SHORTCUT_URL === 'string' && env.ORCA_W3_SHORTCUT_URL.trim()
      ? env.ORCA_W3_SHORTCUT_URL.trim()
      : W3_DEFAULT_SHORTCUT_URL
  const shortcutUrl = asTrustedHttpUrl(rawShortcut) ?? new URL(W3_DEFAULT_SHORTCUT_URL)
  const shortcutHost = shortcutUrl.hostname || W3_TRUSTED_SHORTCUT_HOST

  return {
    configured: true,
    loginUrl: loginUrl.toString(),
    accountApiUrl: accountApiUrl.toString(),
    loginTimeoutMs: parseLoginTimeoutMs(env.ORCA_W3_LOGIN_TIMEOUT_MS),
    loginOrigin: loginUrl.origin,
    accountApiOrigin: accountApiUrl.origin,
    shortcutUrl: shortcutUrl.toString(),
    shortcutHost
  }
}

/**
 * Is `raw` a page the W3 session shortcut may open? Only http(s) with a host
 * that is w3.huawei.com or the explicitly configured shortcut host.
 */
export function isAllowedW3ShortcutUrl(raw: string, config: W3AccountConfig): boolean {
  try {
    const url = new URL(raw.trim())
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) {
      return false
    }
    const trusted = new Set([W3_TRUSTED_SHORTCUT_HOST, config.shortcutHost.toLowerCase()])
    return trusted.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}
