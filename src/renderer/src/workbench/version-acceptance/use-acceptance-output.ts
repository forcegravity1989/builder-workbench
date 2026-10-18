import { useCallback, useEffect, useRef, useState } from 'react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { VersionHistoryPlan } from '../../../../shared/workbench/version-history'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'
import type { CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { decisionFreshness } from './acceptance-decision'
import { sameAcceptanceSource } from './acceptance-model'
import { deriveAcceptanceReport } from './acceptance-report'
import { captureTaskSnapshot } from './acceptance-task-evidence'

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
  const saveTaskSnapshot = useCallback(
    (source: AcceptanceMaterial, reads: CycleTaskRead[]) => {
      const current = controller.value?.document
      if (
        !current ||
        current.version !== context.version ||
        !sameAcceptanceSource(source, current)
      ) {
        throw new Error('验收来源已变化，任务快照未覆盖新材料。')
      }
      controller.edit({
        ...current,
        taskSnapshot: captureTaskSnapshot(reads)
      })
    },
    [context.version, controller]
  )
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
  return {
    saveTaskSnapshot,
    buildReport,
    report:
      report?.document === document && report?.revision === draft?.expectedRevision
        ? report?.markdown
        : null
  }
}
