export const ORCAD_MANAGED_REMOTE_PORT = 6_768

/** Refused because terminals are, or may be, still running on the host. */
export type OrcadManagedRefusal = {
  outcome: 'refused'
  verdict: 'live' | 'unverifiable'
  code: string
  reason: string
  /** Only saved state blocks, which a confirmed "Move anyway" leaves on this desktop. */
  canLeaveBehind?: true
}

/** The one deferral Update anyway may pass: counted terminals the daemon carries across. */
export const ORCAD_UPDATE_TERMINALS_RUNNING_CODE = 'orcad_update_terminals_running'

/** A recovery that needs the operator to accept restoring a snapshot over changed state. */
export const ORCAD_RECOVERY_CHANGED_STATE_CODE = 'orcad_recovery_changed_state'
