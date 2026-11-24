import type { RunRow } from '../../../../orchestration/types'
import { currentRunCoordinatorOrcaSessionId } from '../../../../orchestration/db/runs/run-coordinator-orca-session'

// Why: home_database and coordinator_pane_key are runtime routing state; no caller reads them.
const INTERNAL_RUN_COLUMNS = [
  'home_database',
  'coordinator_pane_key',
  'coordinator_orca_session_id_generation'
] as const

export type RunReceipt = Omit<RunRow, (typeof INTERNAL_RUN_COLUMNS)[number]>

export function exposeRun(run: RunRow): RunReceipt {
  const exposed: Partial<RunRow> = { ...run }
  for (const column of INTERNAL_RUN_COLUMNS) {
    delete exposed[column]
  }
  if (!currentRunCoordinatorOrcaSessionId(run)) {
    delete exposed.coordinator_orca_session_id
  }
  return exposed as RunReceipt
}
