import type { W3AccountStatus, W3FailureReason } from '../../../../shared/w3-account'

/**
 * Presentation model for the W3 Account pane. Pure view routing over the trusted
 * status; no DOM or store dependencies so it is directly unit-testable.
 */
export type W3AccountView =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'signed-out' }
  | { kind: 'login-pending' }
  | { kind: 'signed-in'; hasIdentity: boolean; displayName: string; employeeNo: string }
  | { kind: 'failed'; reason: W3FailureReason }

export function toW3AccountView(status: W3AccountStatus | null): W3AccountView {
  if (!status) {
    return { kind: 'loading' }
  }
  switch (status.state) {
    case 'unconfigured':
      return { kind: 'unconfigured' }
    case 'signed-out':
      return { kind: 'signed-out' }
    case 'login-pending':
      return { kind: 'login-pending' }
    case 'failed':
      return { kind: 'failed', reason: status.reason }
    case 'signed-in':
      return status.identity
        ? {
            kind: 'signed-in',
            hasIdentity: true,
            displayName: status.identity.displayName,
            employeeNo: status.identity.employeeNo
          }
        : { kind: 'signed-in', hasIdentity: false, displayName: '', employeeNo: '' }
  }
}
