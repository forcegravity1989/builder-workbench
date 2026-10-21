import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { MaterialDraftController } from '../version-cycle/material-draft'
import type { CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { sameAcceptanceSource } from './acceptance-model'
import { buildAcceptanceReport } from './acceptance-report'
import { captureTaskSnapshot } from './acceptance-task-evidence'

/**
 * Human-decision freshness, the derived report and the task snapshot. The
 * journey lamps are not derived here — they follow workflow.stage recorded by
 * the session model, and the archive row reads only the recorded PR.
 */
export function useAcceptanceOutput(
  context: VersionCycleContext,
  controller: MaterialDraftController<AcceptanceMaterial>
) {
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
  return { saveTaskSnapshot }
}

export function useAcceptanceReport(
  document: AcceptanceMaterial | undefined,
  plan: PlanningMaterial | undefined,
  onError: (error: string) => void
) {
  const [report, setReport] = useState<{
    document: AcceptanceMaterial
    plan: PlanningMaterial
    markdown: string
  } | null>(null)
  const latest = useRef({ document, plan, active: true })
  latest.current.document = document
  latest.current.plan = plan
  useEffect(() => {
    const state = latest.current
    state.active = true
    return () => {
      state.active = false
    }
  }, [])
  async function buildReport(): Promise<string | null> {
    if (!document || !plan) {
      return null
    }
    try {
      const output = await buildAcceptanceReport(document, plan)
      if (
        latest.current.active &&
        latest.current.document === document &&
        latest.current.plan === plan
      ) {
        setReport({ document, plan, markdown: output.markdown })
        return output.markdown
      }
      return null
    } catch (reason) {
      if (latest.current.active) {
        onError(String(reason))
      }
      return null
    }
  }
  return {
    buildReport,
    report: report?.document === document && report?.plan === plan ? report?.markdown : null
  }
}
