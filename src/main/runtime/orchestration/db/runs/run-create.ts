import type { RunRow } from '../../types'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'
import {
  formatOrcaSessionAddress,
  type OrcaSessionId
} from '../../../../../shared/agent-session/identity/orca-session-address'

// ── Runs ──

export function createRun(
  this: OrchestrationDb,
  params: { objective: string } & (
    | {
        coordinatorHandle: string
        coordinatorPaneKey: string
        coordinatorOrcaSessionId?: OrcaSessionId
      }
    | {
        coordinatorHandle: null
        coordinatorPaneKey: null
        coordinatorOrcaSessionId: OrcaSessionId
      }
  )
): RunRow {
  const id = generateId('run')
  this.db.exec('BEGIN IMMEDIATE')
  try {
    if (params.coordinatorPaneKey !== null) {
      this.unbindOtherRunsForPane(params.coordinatorPaneKey)
    }
    if (params.coordinatorOrcaSessionId) {
      this.unbindOtherRunsForOrcaSession(params.coordinatorOrcaSessionId)
    }
    this.db
      .prepare(
        `INSERT INTO runs (
           id, objective, coordinator_handle, coordinator_pane_key, coordinator_orca_session_id,
           coordinator_orca_session_id_generation, consumer_generation, legacy
         ) VALUES (?, ?, ?, ?, ?, 1, 1, 0)`
      )
      .run(
        id,
        params.objective,
        params.coordinatorHandle,
        params.coordinatorPaneKey,
        params.coordinatorOrcaSessionId ?? null
      )
    const address =
      params.coordinatorHandle === null
        ? formatOrcaSessionAddress(params.coordinatorOrcaSessionId)
        : params.coordinatorHandle
    this.rememberRunCoordinatorHandle(id, address)
    this.db.exec('COMMIT')
  } catch (error) {
    this.db.exec('ROLLBACK')
    throw error
  }
  return this.getRun(id) as RunRow
}

export type RunCreateMethods = {
  createRun: typeof createRun
}

export function attachRunCreate(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    createRun
  })
}
