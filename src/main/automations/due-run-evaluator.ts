/**
 * The scheduler's tick loop: which automations are due, which get skipped, and
 * which dispatch. Split from service.ts for the max-lines budget; the service
 * owns the state (store, run writer, dispatch paths) and hands it in as deps.
 */
import type { Store } from '../persistence'
import type { Automation, AutomationRun } from '../../shared/automations-types'
import { isFinalAutomationRunStatus } from '../../shared/automations-types'
import type { AutomationRunWriter } from './automation-run-writer'
import type { AutomationRunTargetResult } from './run-target-resolution'
import {
  describeScheduledRefusal,
  missedBeyondGrace,
  recordMissedRun,
  recordSkippedOverlap,
  recordUnevaluableAutomation
} from './dispatch-refusal'
import { deriveLifecycleState, isOneShotAutomation } from '../../shared/automation-schedule-kind'

export type DueRunEvaluatorDeps = {
  store: Store
  runs: AutomationRunWriter
  tickMs: number
  resolveTarget: (automation: Automation) => AutomationRunTargetResult
  canDispatch: () => boolean
  requestDispatch: (
    automation: Automation,
    run: AutomationRun,
    target: AutomationRunTargetResult,
    oneShotPrompt?: string,
    dispatchKind?: 'scheduled' | 'manual'
  ) => Promise<AutomationRun>
}

/** Returns the re-entrant-guarded evaluation pass the timer and renderer-ready both fire. */
export function createDueRunEvaluator(deps: DueRunEvaluatorDeps): () => Promise<void> {
  let evaluating = false
  return async () => {
    if (evaluating) {
      return
    }
    evaluating = true
    try {
      const now = Date.now()
      for (const automation of deps.store.listAutomations()) {
        if (!automation.enabled || automation.nextRunAt > now) {
          continue
        }
        if (deriveLifecycleState(automation, now) === 'finished') {
          // 一次性超宽限仍未派发：先补记 skipped_missed（不静默），此后每 tick
          // 走这里都是幂等空转（createRun 去重 + recordMissedRun 幂等）。
          if (
            isOneShotAutomation(automation) &&
            (automation.scheduledRunCount ?? 0) === 0 &&
            missedBeyondGrace({
              automation,
              scheduledFor: automation.onceAt as number,
              now,
              tickMs: deps.tickMs
            })
          ) {
            recordMissedRun({
              runs: deps.runs,
              automation,
              scheduledFor: automation.onceAt as number
            })
          }
          continue
        }
        // Isolated per record (#16303): an unreadable schedule throws out of the
        // occurrence math, and an uncaught throw here skipped every later due row.
        try {
          await evaluateAutomation(deps, automation, now)
        } catch (error) {
          recordUnevaluableAutomation({ runs: deps.runs, automation, error })
        }
      }
    } finally {
      evaluating = false
    }
  }
}

async function evaluateAutomation(deps: DueRunEvaluatorDeps, automation: Automation, now: number) {
  const oneShot = isOneShotAutomation(automation)
  // 一次性不走出现计算：nextRunAt 建档时直写 onceAt。
  const scheduledFor = oneShot
    ? (automation.onceAt as number)
    : deps.store.getLatestAutomationOccurrence(automation, now)
  if (scheduledFor === null) {
    deps.store.advanceAutomationNextRun(automation.id, now)
    return
  }
  if (missedBeyondGrace({ automation, scheduledFor, now, tickMs: deps.tickMs })) {
    recordMissedRun({ runs: deps.runs, automation, scheduledFor })
    if (!oneShot) {
      deps.store.advanceAutomationNextRun(automation.id, now)
    }
    return
  }
  // 并发固定行为（2026-10-10 再审：不提供每任务策略开关）：上次仍在运行（非终态）
  // → 记 skipped_overlap（同因折叠），不推进一次性派发计数；一次性不推进 nextRunAt，
  // 宽限内等上次跑完再派，超宽限由上面 missed 分支统一落 skipped_missed。
  if (
    deps.store
      .listAutomationRuns(automation.id)
      .some((run) => !isFinalAutomationRunStatus(run.status))
  ) {
    recordSkippedOverlap({ runs: deps.runs, automation, scheduledFor })
    if (!oneShot) {
      deps.store.advanceAutomationNextRun(automation.id, now)
    }
    return
  }
  // Resolved before the run exists: a refusal repeats every occurrence, and a
  // */5 automation would otherwise write ~288 identical rows a day — past
  // retention, which would evict the automation's real history.
  const target = deps.resolveTarget(automation)
  const refusal = describeScheduledRefusal({ target, canDispatch: deps.canDispatch() })
  if (refusal && deps.runs.repeatSkip(automation.id, refusal, scheduledFor)) {
    // 派发被拒不计次数：宽限内下个 tick 自然重试（一次性没有下次出现可推进）。
    if (!oneShot) {
      deps.store.advanceAutomationNextRun(automation.id, now)
    }
    return
  }

  await deps.requestDispatch(
    automation,
    deps.runs.createRun(automation, scheduledFor),
    target,
    undefined,
    'scheduled'
  )
  if (!oneShot) {
    deps.store.advanceAutomationNextRun(automation.id, now)
  }
}
