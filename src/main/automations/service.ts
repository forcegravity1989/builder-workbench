import type { WebContents } from 'electron'

/** All the service asks of the renderer: is it still there, and take this message. Narrower
 *  than WebContents so a test can supply the real shape instead of casting one. */
export type AutomationRendererChannel = Pick<WebContents, 'isDestroyed' | 'send'>
import type { Store } from '../persistence'
import {
  isFinalAutomationRunStatus,
  type Automation,
  type AutomationDispatchRequest,
  type AutomationDispatchResult,
  type AutomationPrecheckResult,
  type AutomationRun,
  type AutomationWebhookRunResult
} from '../../shared/automations-types'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { CodexUsageStore } from '../codex-usage/store'
import { runAutomationPrecheck } from './precheck-runner'
import { resolveAutomationRunTarget, type AutomationRunTargetResult } from './run-target-resolution'
import { writeAutomationRunUsage } from './run-usage-collection'
import type { HeadlessAutomationDispatcher } from './headless-dispatch'
import { clearAutomationDispatchTokens, createAutomationDispatchToken } from './dispatch-tokens'
import { runHeadlessAutomationDispatch } from './headless-dispatch-runner'
import {
  AutomationRunCompletionWatcher,
  type AutomationRunTerminalObserver
} from './run-completion-watcher'
import { createAutomationRunWriter, type AutomationRunWriter } from './automation-run-writer'
import { reportAutomationScheduleDrift } from './schedule-drift-report'
import {
  recordRefusedAutomationRun,
  recordSkippedOverlap,
  sendRendererDispatch,
  NO_DISPATCH_HOST
} from './dispatch-refusal'
import { createDueRunEvaluator } from './due-run-evaluator'
import type {
  AutomationsChangedPayload,
  PublishAutomationsChanged
} from '../../shared/runtime-client-events'

const DEFAULT_TICK_MS = 60 * 1000

export class AutomationService {
  private readonly store: Store
  private readonly tickMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private webContents: AutomationRendererChannel | null = null
  private rendererReady = false
  private readonly claudeUsage: ClaudeUsageStore | null
  private readonly codexUsage: CodexUsageStore | null
  private readonly allowRemoteHostScheduling: boolean
  private readonly headlessDispatcher: HeadlessAutomationDispatcher | null
  private readonly publish: PublishAutomationsChanged | null
  private readonly runs: AutomationRunWriter
  private readonly completionWatcher: AutomationRunCompletionWatcher | null
  /** The tick loop's due-pass; created in the constructor over this service's state. */
  private readonly evaluateDueRuns: () => Promise<void>
  /** Installed by desktop IPC registration, where external probes live; null on
   *  runtime servers. Orca's own automation traffic parks queued external
   *  probes behind this lease, whichever transport carried it. */
  externalProbePriority: (<T>(run: () => T) => T) | null = null

  constructor(
    store: Store,
    opts: {
      tickMs?: number
      claudeUsage?: ClaudeUsageStore
      codexUsage?: CodexUsageStore
      allowRemoteHostScheduling?: boolean
      headlessDispatcher?: HeadlessAutomationDispatcher
      terminalObserver?: AutomationRunTerminalObserver
      onAutomationsChanged?: PublishAutomationsChanged
    } = {}
  ) {
    this.store = store
    this.tickMs = opts.tickMs ?? DEFAULT_TICK_MS
    this.claudeUsage = opts.claudeUsage ?? null
    this.codexUsage = opts.codexUsage ?? null
    this.allowRemoteHostScheduling = opts.allowRemoteHostScheduling ?? false
    this.headlessDispatcher = opts.headlessDispatcher ?? null
    this.publish = opts.onAutomationsChanged ?? null
    this.runs = createAutomationRunWriter(store, this.publish)
    this.evaluateDueRuns = createDueRunEvaluator({
      store,
      runs: this.runs,
      tickMs: this.tickMs,
      resolveTarget: (automation) => this.resolveTarget(automation),
      canDispatch: () => this.canDispatch(),
      requestDispatch: (automation, run, target, oneShotPrompt, dispatchKind) =>
        this.requestDispatch(automation, run, target, oneShotPrompt, dispatchKind)
    })
    this.completionWatcher = opts.terminalObserver
      ? new AutomationRunCompletionWatcher({
          observer: opts.terminalObserver,
          readRun: (automationId, runId) =>
            this.store.listAutomationRuns(automationId).find((entry) => entry.id === runId) ?? null,
          markDispatchResult: (result) => this.markDispatchResult(result)
        })
      : null
  }

  /** CRUD callers publish through the service so every authority write lands on
   *  the same local + runtime client-event pair. */
  publishAutomationsChanged(payload: AutomationsChangedPayload = {}): void {
    this.publish?.(payload)
  }

  setWebContents(webContents: AutomationRendererChannel | null): void {
    this.webContents = webContents
    this.rendererReady = false
  }

  setRendererReady(): void {
    this.rendererReady = true
    // Why: the renderer publishes the desktop window graph, so only after it
    // attaches can an unresolvable pane mean a lost terminal rather than "not yet".
    this.completionWatcher?.markTerminalSurfaceReady()
    void this.evaluateDueRuns()
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => {
      void this.evaluateDueRuns()
    }, this.tickMs)
    this.completionWatcher?.reconcileRetainedRuns(this.store.listAutomationRuns())
    reportAutomationScheduleDrift(this.store.listAutomations())
    // Why: headless serve never gets a renderer-ready IPC, but due runs still
    // need the same startup catch-up pass desktop gets after renderer attach.
    if (this.rendererReady || this.headlessDispatcher) {
      // Serve adopts its daemon PTYs and publishes its graph before start(), so
      // its terminal surface is already as answerable as it will get.
      this.completionWatcher?.markTerminalSurfaceReady()
      void this.evaluateDueRuns()
    }
  }

  stop(): void {
    this.completionWatcher?.dispose()
    if (!this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  }

  async runNow(automationId: string, oneShotPrompt?: string): Promise<AutomationRun> {
    const automation = this.store.listAutomations().find((entry) => entry.id === automationId)
    if (!automation) {
      throw new Error('Automation not found.')
    }
    const run = this.runs.createRun(automation, Date.now(), 'manual')
    const target = this.resolveTarget(automation)
    return await this.requestDispatch(automation, run, target, oneShotPrompt)
  }

  /**
   * Webhook 触发：外部手动等价物。与 runNow 的差别只有一处——并发照调度的固定
   * 行为约束（上次仍在运行 → 记 skipped_overlap，不派发）；计数与一次性机会仍
   * 按手动语义不消耗（design「webhook 触发」）。token 与启用检查在端点，不在这里。
   */
  async runWebhook(automationId: string): Promise<AutomationWebhookRunResult> {
    const automation = this.store.listAutomations().find((entry) => entry.id === automationId)
    if (!automation) {
      throw new Error('Automation not found.')
    }
    const now = Date.now()
    if (
      this.store
        .listAutomationRuns(automation.id)
        .some((run) => !isFinalAutomationRunStatus(run.status))
    ) {
      recordSkippedOverlap({ runs: this.runs, automation, scheduledFor: now })
      return { outcome: 'skipped_overlap' }
    }
    const run = this.runs.createRun(automation, now, 'webhook')
    const target = this.resolveTarget(automation)
    return {
      outcome: 'dispatched',
      run: await this.requestDispatch(automation, run, target)
    }
  }

  /** The run-history row doc:94 pairs with the typed refusal an execute fence throws. */
  recordRefusedRun(automationId: string): void {
    const automation = this.store.listAutomations().find((entry) => entry.id === automationId)
    if (automation) {
      recordRefusedAutomationRun({
        store: this.store,
        runs: this.runs,
        automation,
        allowRemoteHostScheduling: this.allowRemoteHostScheduling
      })
    }
  }

  async runPrecheck(automationId: string, runId: string): Promise<AutomationPrecheckResult | null> {
    const automation = this.store.listAutomations().find((entry) => entry.id === automationId)
    if (!automation) {
      throw new Error('Automation not found.')
    }
    const run = this.store.listAutomationRuns(automationId).find((entry) => entry.id === runId)
    if (!run) {
      throw new Error('Automation run not found.')
    }
    if (run.trigger !== 'scheduled' || !automation.precheck) {
      return null
    }
    const target = this.resolveTarget(automation)
    if (!target.ok) {
      return {
        command: automation.precheck.command,
        exitCode: null,
        timedOut: false,
        durationMs: 0,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false,
        error: target.error,
        startedAt: Date.now(),
        completedAt: Date.now()
      }
    }
    return await runAutomationPrecheck({
      precheck: automation.precheck,
      target:
        automation.executionTargetType === 'ssh'
          ? { type: 'ssh', cwd: target.cwd, connectionId: automation.executionTargetId }
          : { type: 'local', cwd: target.cwd }
    })
  }

  async markDispatchResult(result: AutomationDispatchResult): Promise<AutomationRun> {
    const run = this.runs.updateRun(result)
    clearAutomationDispatchTokens(run.automationId, run.id)
    if (!isFinalAutomationRunStatus(run.status)) {
      if (run.status === 'dispatched') {
        this.completionWatcher?.watch(run)
      }
      return run
    }
    this.completionWatcher?.forget(run.id)
    // Why: the renderer's mark-completed effect can re-fire for the same run
    // before refresh() flips its status snapshot off 'dispatched'. Re-running
    // collectRunUsage advances the attribution window and can rewrite an
    // already-collected 'known' usage to 'unavailable'/'ambiguous_session'.
    if (run.usage) {
      return run
    }
    return await writeAutomationRunUsage({
      store: this.store,
      runs: this.runs,
      run,
      claudeUsage: this.claudeUsage,
      codexUsage: this.codexUsage
    })
  }

  private resolveTarget(automation: Automation): AutomationRunTargetResult {
    return resolveAutomationRunTarget(this.store, automation, {
      allowRemoteHostScheduling: this.allowRemoteHostScheduling
    })
  }

  private canDispatchToRenderer(): boolean {
    const webContents = this.webContents
    return Boolean(webContents && !webContents.isDestroyed() && this.rendererReady)
  }

  /** Headless serve counts: it launches runs with no window at all. */
  private canDispatch(): boolean {
    return this.canDispatchToRenderer() || Boolean(this.headlessDispatcher)
  }

  private async requestDispatch(
    automation: Automation,
    run: AutomationRun,
    target: AutomationRunTargetResult,
    oneShotPrompt?: string,
    dispatchKind: 'scheduled' | 'manual' = 'manual'
  ): Promise<AutomationRun> {
    if (!target.ok) {
      return this.runs.updateRun({
        runId: run.id,
        status: 'skipped_unavailable',
        workspaceId: automation.workspaceId,
        error: target.error
      })
    }
    if (!this.canDispatchToRenderer()) {
      if (this.headlessDispatcher) {
        if (dispatchKind === 'scheduled') {
          this.store.recordAutomationScheduledDispatch(automation.id)
        }
        return await runHeadlessAutomationDispatch({
          automation,
          run,
          target,
          ...(oneShotPrompt ? { oneShotPrompt } : {}),
          dispatcher: this.headlessDispatcher,
          runs: this.runs,
          runPrecheck: () => this.runPrecheck(automation.id, run.id),
          markDispatchResult: (result) => this.markDispatchResult(result),
          watchRun: (dispatched) => this.completionWatcher?.watch(dispatched)
        })
      }
      return this.runs.updateRun({
        runId: run.id,
        status: 'skipped_unavailable',
        workspaceId: automation.workspaceId,
        error: NO_DISPATCH_HOST
      })
    }
    // 计数只在真实派发点：手动（runNow/试跑）不递增——试跑不吃掉一次性机会。
    if (dispatchKind === 'scheduled') {
      this.store.recordAutomationScheduledDispatch(automation.id)
    }
    const updated = this.runs.updateRun({
      runId: run.id,
      status: 'dispatching',
      workspaceId: automation.workspaceId,
      error: null
    })
    const payload: AutomationDispatchRequest = {
      automation,
      run: updated,
      dispatchToken: createAutomationDispatchToken(automation.id, updated.id),
      ...(oneShotPrompt ? { oneShotPrompt } : {})
    }
    return sendRendererDispatch(this.webContents, payload, this.runs, updated)
  }
}
