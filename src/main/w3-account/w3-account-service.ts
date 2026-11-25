// Why: orchestrates the W3 Account login lifecycle (restore / start / cancel /
// sign out). Login is the W3 portal page in a dedicated persistent browser
// session; identity comes ONLY from polling the W3 account API in that same
// session (HTTP 200 + parseable employeeNumber/uid). 421 = not logged in yet.
// Dependencies are injected so the state machine can be unit-tested without
// electron.
//
// Every async operation is bound to a "generation" + the Orca profile id it
// was started for. After any await we re-check the binding, so a superseded
// request (cancel / retry / sign-out / profile switch / dispose) can never
// resurrect a signed-in identity or hijack a newer poller.
import type {
  W3AccountStatus,
  W3FailureReason,
  W3Identity,
  W3StartLoginResult
} from '../../shared/w3-account'
import {
  checkW3AccountIdentity,
  type W3FetchInit,
  type W3FetchResponse
} from './w3-account-identity'
import {
  isAllowedW3ShortcutUrl,
  type W3AccountConfig,
  type W3AccountConfigResult
} from './w3-account-config'
import type { W3SessionBridgeResult } from './w3-session-bridge'

/** Minimal surface of the W3 login BrowserWindow the service needs. */
export type W3LoginWindowHandle = {
  isWindowClosed: () => boolean
  closeWindow: () => void
}

export type W3Scheduler = {
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

export type W3AccountServiceDeps = {
  getConfig: () => W3AccountConfigResult
  getActiveProfileId: () => string
  ensureSessionProfile: (orcaProfileId: string) => Promise<{ profileId: string; partition: string }>
  /** Same-session fetch (cookies included) against the account API. */
  fetch: (partition: string, url: string, init: W3FetchInit) => Promise<W3FetchResponse>
  clearDedicatedStorage: (partition: string) => Promise<void>
  openLoginWindow: (config: W3AccountConfig, sessionProfileId: string) => W3LoginWindowHandle
  /** Harvest a passwordless SSO session from the controlled system Chrome and transplant it. */
  syncSession: (partition: string, signal: AbortSignal) => Promise<W3SessionBridgeResult>
  broadcast: (status: W3AccountStatus) => void
  now?: () => number
  scheduler?: W3Scheduler
  /** Account-API poll cadence. */
  intervalMs?: number
  /** Per-request account-API timeout. */
  fetchTimeoutMs?: number
}

type Poller = {
  running: boolean
  generation: number
  orcaProfileId: string
  sessionProfileId: string
  partition: string
  startedAt: number
  timeoutMs: number
  timer: unknown
  window: W3LoginWindowHandle
}

type Sync = {
  generation: number
  orcaProfileId: string
  sessionProfileId: string
  partition: string
  abort: AbortController
}

const DEFAULT_INTERVAL_MS = 2000
const DEFAULT_FETCH_TIMEOUT_MS = 8000

function failure(reason: W3FailureReason): W3AccountStatus {
  return { state: 'failed', reason }
}

/** The target to open in the signed-in W3 session, or the reason it was refused. */
export type W3OpenWebTarget =
  | { ok: true; partition: string; url: string }
  | { ok: false; reason: 'not-signed-in' | 'invalid-url' }

export class W3AccountService {
  private readonly deps: W3AccountServiceDeps
  private readonly now: () => number
  private readonly scheduler: W3Scheduler
  private readonly intervalMs: number
  private readonly fetchTimeoutMs: number
  private poller: Poller | null = null
  private sync: Sync | null = null
  private generation = 0
  /** Last confirmed signed-in identity, so start() can short-circuit (no 2nd window). */
  private signedIn: {
    orcaProfileId: string
    sessionProfileId: string
    partition: string
    identity: W3Identity | null
  } | null = null

  constructor(deps: W3AccountServiceDeps) {
    this.deps = deps
    this.now = deps.now ?? (() => Date.now())
    this.scheduler = deps.scheduler ?? {
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
    }
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.fetchTimeoutMs = deps.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  }

  /** Logical status from in-memory state only — never resurrects a stale identity. */
  private statusNow(orcaProfileId: string): W3AccountStatus {
    if (this.poller?.running && this.poller.orcaProfileId === orcaProfileId) {
      return { state: 'login-pending', sessionProfileId: this.poller.sessionProfileId }
    }
    if (this.sync && this.sync.orcaProfileId === orcaProfileId) {
      return { state: 'sync-pending', sessionProfileId: this.sync.sessionProfileId }
    }
    return { state: 'signed-out' }
  }

  /**
   * Restore/validate the current state: a single trusted account-API check in
   * the dedicated session. 200 + parseable identity = signed-in; 421 or any
   * other answer = signed-out. Never infers identity from a page or cookie.
   */
  async getStatus(): Promise<W3AccountStatus> {
    const config = this.deps.getConfig()
    if (!config.configured) {
      return { state: 'unconfigured' }
    }
    const orcaProfileId = this.deps.getActiveProfileId()
    if (this.poller && this.poller.orcaProfileId !== orcaProfileId) {
      // Why: a poller left over from a different Orca profile must never be
      // reported as this profile's login-pending.
      this.cancelPoller()
      this.generation += 1
    }
    if (this.sync && this.sync.orcaProfileId !== orcaProfileId) {
      this.cancelSync()
      this.generation += 1
    }
    if (this.poller?.running && this.poller.orcaProfileId === orcaProfileId) {
      // In-flight login is not a confirmed sign-in; drop any stale cache.
      this.signedIn = null
      return { state: 'login-pending', sessionProfileId: this.poller.sessionProfileId }
    }
    if (this.sync && this.sync.orcaProfileId === orcaProfileId) {
      this.signedIn = null
      return { state: 'sync-pending', sessionProfileId: this.sync.sessionProfileId }
    }
    const generation = this.generation
    let handle: { profileId: string; partition: string }
    try {
      handle = await this.deps.ensureSessionProfile(orcaProfileId)
    } catch {
      this.signedIn = null
      return { state: 'signed-out' }
    }
    if (this.generation !== generation) {
      return this.statusNow(this.deps.getActiveProfileId())
    }
    const result = await checkW3AccountIdentity(
      this.deps.fetch,
      config,
      handle.partition,
      this.fetchTimeoutMs
    )
    if (this.generation !== generation) {
      return this.statusNow(this.deps.getActiveProfileId())
    }
    if (result.state === 'authenticated') {
      this.signedIn = {
        orcaProfileId,
        sessionProfileId: handle.profileId,
        partition: handle.partition,
        identity: result.identity
      }
      return {
        state: 'signed-in',
        sessionProfileId: handle.profileId,
        sessionPartition: handle.partition,
        identity: result.identity
      }
    }
    // 421 / other answers / network: no trusted identity right now.
    this.signedIn = null
    return { state: 'signed-out' }
  }

  /**
   * Resolve the W3 shortcut to open in the signed-in session. This is NOT a
   * generic URL box: the target defaults to the configured W3 home and any
   * provided url must stay within the trusted hosts (w3.huawei.com or the
   * explicitly configured shortcut host). Only allowed when signed in; returns
   * the dedicated partition (the SAME one used by the login window / poll).
   */
  async resolveOpenWebTarget(url?: string): Promise<W3OpenWebTarget> {
    const configResult = this.deps.getConfig()
    if (!configResult.configured) {
      return { ok: false, reason: 'not-signed-in' }
    }
    const target = typeof url === 'string' && url.trim() ? url.trim() : configResult.shortcutUrl
    if (!isAllowedW3ShortcutUrl(target, configResult)) {
      return { ok: false, reason: 'invalid-url' }
    }
    const status = await this.getStatus()
    if (status.state !== 'signed-in') {
      return { ok: false, reason: 'not-signed-in' }
    }
    const orcaProfileId = this.deps.getActiveProfileId()
    let handle: { profileId: string; partition: string }
    try {
      handle = await this.deps.ensureSessionProfile(orcaProfileId)
    } catch {
      return { ok: false, reason: 'not-signed-in' }
    }
    return { ok: true, partition: handle.partition, url: target }
  }

  /**
   * Begin a login: open the W3 portal in the dedicated-session login window
   * and start a single bounded poll for the account API. If a poller is
   * already running for this profile, report login-pending instead.
   */
  async startLogin(): Promise<W3StartLoginResult> {
    const config = this.deps.getConfig()
    if (!config.configured) {
      return { status: { state: 'unconfigured' } }
    }
    const orcaProfileId = this.deps.getActiveProfileId()
    if (this.poller) {
      if (this.poller.orcaProfileId !== orcaProfileId) {
        this.cancelPoller()
        this.generation += 1
      } else {
        return {
          status: { state: 'login-pending', sessionProfileId: this.poller.sessionProfileId }
        }
      }
    }
    // Why cancel an in-flight bridge: the user explicitly chose the manual
    // fallback, so the background harvest must stop and not resurrect state.
    if (this.sync) {
      this.cancelSync()
      this.generation += 1
    }
    // Why: if this profile is already signed in (confirmed by a prior status
    // check), don't open a second login window — just return the current state.
    if (this.signedIn && this.signedIn.orcaProfileId === orcaProfileId) {
      return {
        status: {
          state: 'signed-in',
          sessionProfileId: this.signedIn.sessionProfileId,
          sessionPartition: this.signedIn.partition,
          identity: this.signedIn.identity
        }
      }
    }
    const generation = ++this.generation
    let handle: { profileId: string; partition: string }
    try {
      handle = await this.deps.ensureSessionProfile(orcaProfileId)
    } catch {
      return { status: failure('open-failed') }
    }
    if (this.generation !== generation) {
      return { status: this.statusNow(this.deps.getActiveProfileId()) }
    }
    let window: W3LoginWindowHandle
    try {
      // Why: the login window must share the EXACT session partition the poller
      // reads from, otherwise its cookies are invisible to the account-API poll.
      window = this.deps.openLoginWindow(config, handle.partition)
    } catch {
      return { status: failure('open-failed') }
    }
    if (this.generation !== generation) {
      window.closeWindow()
      return { status: this.statusNow(this.deps.getActiveProfileId()) }
    }
    this.poller = {
      running: true,
      generation,
      orcaProfileId,
      sessionProfileId: handle.profileId,
      partition: handle.partition,
      startedAt: this.now(),
      timeoutMs: config.loginTimeoutMs,
      timer: null,
      window
    }
    this.scheduleTick(config, this.poller)
    const status: W3AccountStatus = { state: 'login-pending', sessionProfileId: handle.profileId }
    this.deps.broadcast(status)
    return { status }
  }

  /**
   * Begin the session bridge: harvest a passwordless SSO session from the
   * controlled system Chrome into the dedicated partition, then confirm it
   * with the same trusted account API. Returns immediately with
   * sync-pending; the outcome arrives via broadcast. The manual login window
   * stays available as the fallback path when this fails.
   */
  async syncFromSystemBrowser(): Promise<W3AccountStatus> {
    const config = this.deps.getConfig()
    if (!config.configured) {
      return { state: 'unconfigured' }
    }
    const orcaProfileId = this.deps.getActiveProfileId()
    if (this.poller) {
      if (this.poller.orcaProfileId !== orcaProfileId) {
        this.cancelPoller()
        this.generation += 1
      } else {
        return { state: 'login-pending', sessionProfileId: this.poller.sessionProfileId }
      }
    }
    if (this.sync) {
      if (this.sync.orcaProfileId !== orcaProfileId) {
        this.cancelSync()
        this.generation += 1
      } else {
        return { state: 'sync-pending', sessionProfileId: this.sync.sessionProfileId }
      }
    }
    if (this.signedIn && this.signedIn.orcaProfileId === orcaProfileId) {
      return {
        state: 'signed-in',
        sessionProfileId: this.signedIn.sessionProfileId,
        sessionPartition: this.signedIn.partition,
        identity: this.signedIn.identity
      }
    }
    const generation = ++this.generation
    let handle: { profileId: string; partition: string }
    try {
      handle = await this.deps.ensureSessionProfile(orcaProfileId)
    } catch {
      // Why sync-failed, not open-failed: the bridge path never opens a
      // login window, so "cannot open the W3 login window" would mislead.
      return failure('sync-failed')
    }
    if (this.generation !== generation) {
      return this.statusNow(this.deps.getActiveProfileId())
    }
    const sync: Sync = {
      generation,
      orcaProfileId,
      sessionProfileId: handle.profileId,
      partition: handle.partition,
      abort: new AbortController()
    }
    this.sync = sync
    const status: W3AccountStatus = { state: 'sync-pending', sessionProfileId: handle.profileId }
    this.deps.broadcast(status)
    void this.runSync(config, sync)
    return status
  }

  private async runSync(config: W3AccountConfig, sync: Sync): Promise<void> {
    let result: W3SessionBridgeResult
    try {
      result = await this.deps.syncSession(sync.partition, sync.abort.signal)
    } catch {
      result = { ok: false, reason: 'cookie-read-failed' }
    }
    if (this.sync !== sync || sync.generation !== this.generation) {
      // Why clear: a superseded sync must not leave this.sync dangling —
      // every later status answer would otherwise report sync-pending.
      if (this.sync === sync) {
        this.sync = null
      }
      return
    }
    if (!result.ok) {
      this.sync = null
      this.generation += 1
      // Why one line: the six harvest failure modes collapse into
      // sync-failed for the UI, so this is the only place field diagnosis
      // can start from. Never logs cookie values — reason codes only.
      console.warn(`[w3-account] session bridge failed: ${result.reason}`)
      this.deps.broadcast(failure('sync-failed'))
      return
    }
    // Why the account API after the transplant: cookie presence never counts
    // as a login — the bridge only moves a session, the trusted API confirms it.
    const identity = await checkW3AccountIdentity(
      this.deps.fetch,
      config,
      sync.partition,
      this.fetchTimeoutMs
    )
    if (this.sync !== sync || sync.generation !== this.generation) {
      if (this.sync === sync) {
        this.sync = null
      }
      return
    }
    this.sync = null
    this.generation += 1
    if (identity.state === 'authenticated') {
      this.signedIn = {
        orcaProfileId: sync.orcaProfileId,
        sessionProfileId: sync.sessionProfileId,
        partition: sync.partition,
        identity: identity.identity
      }
      this.deps.broadcast({
        state: 'signed-in',
        sessionProfileId: sync.sessionProfileId,
        sessionPartition: sync.partition,
        identity: identity.identity
      })
      return
    }
    this.deps.broadcast(failure('sync-failed'))
  }

  private cancelSync(): void {
    if (!this.sync) {
      return
    }
    this.sync.abort.abort()
    this.sync = null
  }

  /** Cancel an in-flight login (user action / config change). Closes the window. */
  async cancelLogin(): Promise<W3AccountStatus> {
    this.cancelPoller()
    this.cancelSync()
    this.generation += 1
    this.signedIn = null
    return this.statusNow(this.deps.getActiveProfileId())
  }

  /**
   * Sign out: stop polling, close the login window, and clear only the
   * dedicated W3 partition's local storage (cookies + web storage). Never
   * touches the default/other profile sessions. Cleanup failure is reported
   * as a retryable failure — never as a successful sign-out, or the UI would
   * claim the user is signed out while the session (and its cookies) is
   * still alive.
   */
  async signOut(): Promise<W3AccountStatus> {
    this.cancelPoller()
    // Why cancel the bridge too: an in-flight sync would keep writing
    // cookies into the partition this call is about to clear, silently
    // resurrecting the sign-out on its next account-API hit.
    this.cancelSync()
    this.signedIn = null
    const generation = ++this.generation
    const orcaProfileId = this.deps.getActiveProfileId()
    let handle: { profileId: string; partition: string }
    try {
      handle = await this.deps.ensureSessionProfile(orcaProfileId)
    } catch {
      return failure('sign-out-failed')
    }
    if (this.generation !== generation) {
      return this.statusNow(this.deps.getActiveProfileId())
    }
    try {
      await this.deps.clearDedicatedStorage(handle.partition)
    } catch {
      return failure('sign-out-failed')
    }
    if (this.generation !== generation) {
      return this.statusNow(this.deps.getActiveProfileId())
    }
    return { state: 'signed-out' }
  }

  /** Tear down the poller/sync/window and invalidate in-flight work (exit). */
  dispose(): void {
    this.cancelPoller()
    this.cancelSync()
    this.generation += 1
    this.signedIn = null
  }

  private cancelPoller(): void {
    if (!this.poller) {
      return
    }
    this.poller.running = false
    if (this.poller.timer !== null) {
      this.scheduler.clearTimer(this.poller.timer)
    }
    try {
      this.poller.window.closeWindow()
    } catch {
      // Already closed/destroyed.
    }
    this.poller = null
  }

  private scheduleTick(config: W3AccountConfig, poller: Poller): void {
    if (this.poller !== poller || !poller.running) {
      return
    }
    poller.timer = this.scheduler.setTimer(() => {
      void this.tick(config, poller)
    }, this.intervalMs)
  }

  private async tick(config: W3AccountConfig, poller: Poller): Promise<void> {
    // Why: bind to the exact poller instance — a superseded poller must not
    // act even if its timer fired late.
    if (this.poller !== poller || !poller.running || poller.generation !== this.generation) {
      return
    }
    // The user closed the login window themselves — stop waiting.
    if (poller.window.isWindowClosed()) {
      this.cancelPoller()
      this.generation += 1
      this.deps.broadcast(failure('cancelled'))
      return
    }
    if (this.now() - poller.startedAt >= poller.timeoutMs) {
      this.cancelPoller()
      this.generation += 1
      this.deps.broadcast(failure('timeout'))
      return
    }
    const result = await checkW3AccountIdentity(
      this.deps.fetch,
      config,
      poller.partition,
      this.fetchTimeoutMs
    )
    // Re-check after the await: the poller may have been cancelled/replaced
    // while the request was in flight.
    if (this.poller !== poller || !poller.running || poller.generation !== this.generation) {
      return
    }
    if (result.state === 'authenticated') {
      const status: W3AccountStatus = {
        state: 'signed-in',
        sessionProfileId: poller.sessionProfileId,
        sessionPartition: poller.partition,
        identity: result.identity
      }
      this.signedIn = {
        orcaProfileId: poller.orcaProfileId,
        sessionProfileId: poller.sessionProfileId,
        partition: poller.partition,
        identity: result.identity
      }
      this.cancelPoller() // closes the login window
      this.generation += 1
      this.deps.broadcast(status)
      return
    }
    if (result.state === 'login-failed' || result.state === 'parse-failed') {
      this.cancelPoller()
      this.generation += 1
      this.deps.broadcast(
        failure(result.state === 'parse-failed' ? 'account-parse-failed' : 'login-failed')
      )
      return
    }
    // 421 (not logged in yet) or transient network: keep waiting.
    this.scheduleTick(config, poller)
  }
}
