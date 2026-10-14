import { useEffect, useRef, useState } from 'react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { VersionHistoryPlan } from '../../../../shared/workbench/version-history'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'
import type { CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { decisionFreshness } from './acceptance-decision'
import { sameAcceptanceSource } from './acceptance-model'
import { deriveAcceptanceReport } from './acceptance-report'
import { captureTaskSnapshot } from './acceptance-task-evidence'
import type { DecisionFreshness } from './acceptance-decision'

/**
 * Human-decision freshness, the derived report and the task snapshot. The
 * journey lamps are not derived here — they follow workflow.stage recorded by
 * the session model, and the archive row reads only the recorded PR.
 */
export function useAcceptanceOutput(
  context: VersionCycleContext,
  controller: MaterialDraftController<AcceptanceMaterial>,
  draft: MaterialDraft<AcceptanceMaterial> | null,
  plan: VersionHistoryPlan | null,
  onError: (error: string) => void
) {
  const document = draft?.document
  const [decisionResult, setDecisionResult] = useState<{
    document: AcceptanceMaterial
    plan: VersionHistoryPlan
    states: Record<string, DecisionFreshness>
  } | null>(null)
  useEffect(() => {
    if (!document || !plan) {
      return
    }
    let current = true
    void Promise.all(
      plan.document.goals.map(
        async (goal) =>
          [goal.goalId, await decisionFreshness(document, plan.document, goal.goalId)] as const
      )
    )
      .then((states) => {
        if (current) {
          setDecisionResult({
            document,
            plan,
            states: Object.fromEntries(states)
          })
        }
      })
      .catch(() => {
        if (current) {
          setDecisionResult(null)
        }
      })
    return () => {
      current = false
    }
  }, [document, plan])
  const [report, setReport] = useState<{
    document: AcceptanceMaterial
    revision: string | null
    markdown: string
  } | null>(null)
  const lifetime = useRef({ active: true }).current
  useEffect(() => {
    lifetime.active = true
    return () => {
      lifetime.active = false
    }
  }, [lifetime])
  const decisionStates =
    decisionResult?.document === document && decisionResult?.plan === plan
      ? (decisionResult?.states ?? null)
      : null
  function saveTaskSnapshot(source: AcceptanceMaterial, reads: CycleTaskRead[]) {
    const current = controller.value?.document
    if (!current || current.version !== context.version || !sameAcceptanceSource(source, current)) {
      throw new Error('验收来源已变化，任务快照未覆盖新材料。')
    }
    controller.edit({
      ...current,
      taskSnapshot: captureTaskSnapshot(reads)
    })
  }
  /** Returns the derived markdown, or null when nothing honest could be produced. */
  async function buildReport(): Promise<string | null> {
    if (!document || !plan) {
      return null
    }
    try {
      const decisions = Object.fromEntries(
        await Promise.all(
          plan.document.goals.map(async (goal) => [
            goal.goalId,
            await decisionFreshness(document, plan.document, goal.goalId)
          ])
        )
      )
      const output = deriveAcceptanceReport({
        document,
        plan: plan.document,
        decisions
      })
      if (lifetime.active && controller.value?.document === document) {
        setReport({
          document,
          revision: draft?.expectedRevision ?? null,
          markdown: output.markdown
        })
        return output.markdown
      }
      return null
    } catch (reason) {
      if (lifetime.active) {
        onError(String(reason))
      }
      return null
    }
  }
  const decisionSummary = (() => {
    if (!document || !plan) {
      return { goals: 0, pending: 0, notMet: 0 }
    }
    let pending = 0
    let notMet = 0
    for (const goal of plan.document.goals) {
      const result = document.results.find((item) => item.goalId === goal.goalId)
      const freshness = decisionStates?.[goal.goalId] ?? null
      if (!result?.decision || result.decision.outcome === 'pending' || freshness === 'changed') {
        pending++
      } else if (result.decision.outcome === 'not-met') {
        notMet++
      }
    }
    return { goals: plan.document.goals.length, pending, notMet }
  })()
  return {
    decisionSummary,
    saveTaskSnapshot,
    buildReport,
    report:
      report?.document === document && report?.revision === draft?.expectedRevision
        ? report?.markdown
        : null
  }
}
