// Why: shared contract for the W3 Account feature, consumed by main, preload and
// renderer. Kept free of electron/node imports so it can be exercised by unit tests.

/** Only the two necessary identity fields ever cross the main→renderer boundary. */
export type W3Identity = {
  displayName: string
  employeeNo: string
}

export type W3FailureReason =
  | 'not-configured'
  | 'open-failed'
  | 'timeout'
  | 'cancelled'
  | 'login-failed'
  | 'account-parse-failed'

/**
 * Renderer-visible account state. A "signed-in" state is only produced from a
 * successful W3 account-API response (HTTP 200 + parseable employeeNumber/uid)
 * in the dedicated browser session; page load, URL and cookie presence never
 * produce it (HTTP 421 = "No login user found." = still signed out).
 */
export type W3AccountStatus =
  | { state: 'unconfigured' }
  | { state: 'signed-out' }
  | { state: 'login-pending'; sessionProfileId: string }
  | { state: 'signed-in'; sessionProfileId: string; identity: W3Identity | null }
  | { state: 'failed'; reason: W3FailureReason }

/** Result of a login request. Main opens the W3 login window itself. */
export type W3StartLoginResult = {
  status: W3AccountStatus
}

/**
 * Request to open the W3 home shortcut inside the signed-in W3 session. `url`
 * is optional and, when present, must stay on a trusted W3 host; normally the
 * renderer passes nothing and the configured W3 home is opened.
 */
export type W3OpenWebRequest = {
  url?: string
}

export type W3OpenWebFailureReason = 'not-signed-in' | 'invalid-url' | 'open-failed'

export type W3OpenWebResult = { ok: true } | { ok: false; reason: W3OpenWebFailureReason }

/** Main → renderer push when the login poll resolves or fails. */
export const W3_ACCOUNT_STATUS_CHANGED_CHANNEL = 'w3Auth:statusChanged'
