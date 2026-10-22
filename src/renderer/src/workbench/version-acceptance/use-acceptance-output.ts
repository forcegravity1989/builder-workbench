import { useCallback } from 'react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { MaterialDraftController } from '../version-cycle/material-draft'
import type { CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { sameAcceptanceSource } from './acceptance-model'
import { captureTaskSnapshot } from './acceptance-task-evidence'

/**
 * The Issue snapshot a human verdict's ledger revision cites. The derived
 * preview-minutes report is retired: meeting conclusions live in the minutes
 * section the human confirms, and the evidence report is a model-written file
 * registered as an artifact rather than a board derivation.
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
