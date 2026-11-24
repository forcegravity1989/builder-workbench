import type { OrchestrationDb } from '../orchestration-db'
import { currentRunCoordinatorSessionAddressSql } from './run-coordinator-orca-session'
import { orcaSessionAddressSql } from '../orca-session-address-sql'

export function rememberRunCoordinatorHandle(
  this: OrchestrationDb,
  runId: string,
  terminalHandle: string
): void {
  this.db
    .prepare(
      `INSERT OR IGNORE INTO run_coordinator_handles (run_id, terminal_handle) VALUES (?, ?)`
    )
    .run(runId, terminalHandle)
}

export function rememberCurrentRunCoordinatorHandles(this: OrchestrationDb): void {
  const sessionAddress = currentRunCoordinatorSessionAddressSql('runs')
  this.db.exec(`
    INSERT OR IGNORE INTO run_coordinator_handles (run_id, terminal_handle)
    SELECT id, coordinator_handle FROM runs
    WHERE legacy = 0 AND coordinator_handle IS NOT NULL;
    INSERT OR IGNORE INTO run_coordinator_handles (run_id, terminal_handle)
    SELECT id, ${sessionAddress} FROM runs
    WHERE legacy = 0 AND ${sessionAddress} IS NOT NULL;
  `)
}

export function createCoordinatorMailRoutingTrigger(this: OrchestrationDb): void {
  const sessionAddress = currentRunCoordinatorSessionAddressSql('NEW')
  const dispatchAddress = orcaSessionAddressSql('dispatch_contexts.assignee_orca_session_id')
  this.db.exec('BEGIN IMMEDIATE')
  try {
    this.db.exec(`
      DROP TRIGGER IF EXISTS trg_runs_remember_coordinator_insert;
      DROP TRIGGER IF EXISTS trg_runs_remember_coordinator_update;
      CREATE TRIGGER trg_runs_remember_coordinator_insert
      AFTER INSERT ON runs
      WHEN NEW.legacy = 0
      BEGIN
        INSERT OR IGNORE INTO run_coordinator_handles (run_id, terminal_handle)
        SELECT NEW.id, NEW.coordinator_handle WHERE NEW.coordinator_handle IS NOT NULL;
        INSERT OR IGNORE INTO run_coordinator_handles (run_id, terminal_handle)
        SELECT NEW.id, ${sessionAddress} WHERE ${sessionAddress} IS NOT NULL;
      END;
      CREATE TRIGGER trg_runs_remember_coordinator_update
      AFTER UPDATE OF coordinator_handle, coordinator_orca_session_id,
        coordinator_orca_session_id_generation ON runs
      WHEN NEW.legacy = 0
      BEGIN
        INSERT OR IGNORE INTO run_coordinator_handles (run_id, terminal_handle)
        SELECT NEW.id, NEW.coordinator_handle WHERE NEW.coordinator_handle IS NOT NULL;
        INSERT OR IGNORE INTO run_coordinator_handles (run_id, terminal_handle)
        SELECT NEW.id, ${sessionAddress} WHERE ${sessionAddress} IS NOT NULL;
      END;
      DROP TRIGGER IF EXISTS trg_messages_route_coordinator_mail;
      CREATE TRIGGER trg_messages_route_coordinator_mail
      AFTER INSERT ON messages
      WHEN NEW.read = 0 AND NEW.delivery_contract = 'current_delivery'
        AND EXISTS (
          SELECT 1 FROM runs
          WHERE runs.id = NEW.run_id AND runs.legacy = 0
        )
        AND EXISTS (
          SELECT 1 FROM run_coordinator_handles
          WHERE run_id = NEW.run_id AND terminal_handle = NEW.to_handle
        )
        AND NOT EXISTS (
          SELECT 1 FROM dispatch_contexts
          WHERE run_id = NEW.run_id
            AND (assignee_handle = NEW.to_handle OR ${dispatchAddress} = NEW.to_handle)
            AND status IN ('pending', 'dispatched')
        )
      BEGIN
        UPDATE messages SET to_handle = 'run:' || NEW.run_id WHERE sequence = NEW.sequence;
      END;
    `)
    this.db.exec('COMMIT')
  } catch (error) {
    this.db.exec('ROLLBACK')
    throw error
  }
}

export function routeAllUnreadDirectMessagesToRunMailbox(
  this: OrchestrationDb,
  runId: string,
  directHandle: string
): void {
  const dispatchAddress = orcaSessionAddressSql('dispatch_contexts.assignee_orca_session_id')
  this.db
    .prepare(
      `UPDATE messages SET to_handle = ?
       WHERE run_id = ? AND to_handle = ? AND read = 0
         AND delivery_contract = 'current_delivery'
         AND NOT EXISTS (
           SELECT 1 FROM dispatch_contexts
           WHERE dispatch_contexts.run_id = messages.run_id
             AND (dispatch_contexts.assignee_handle = messages.to_handle
               OR ${dispatchAddress} = messages.to_handle)
             AND dispatch_contexts.status IN ('pending', 'dispatched')
         )`
    )
    .run(`run:${runId}`, runId, directHandle)
}

export type RunCoordinatorMailRoutingMethods = {
  rememberRunCoordinatorHandle: typeof rememberRunCoordinatorHandle
  rememberCurrentRunCoordinatorHandles: typeof rememberCurrentRunCoordinatorHandles
  createCoordinatorMailRoutingTrigger: typeof createCoordinatorMailRoutingTrigger
  routeAllUnreadDirectMessagesToRunMailbox: typeof routeAllUnreadDirectMessagesToRunMailbox
}

export function attachRunCoordinatorMailRouting(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    rememberRunCoordinatorHandle,
    rememberCurrentRunCoordinatorHandles,
    createCoordinatorMailRoutingTrigger,
    routeAllUnreadDirectMessagesToRunMailbox
  })
}
