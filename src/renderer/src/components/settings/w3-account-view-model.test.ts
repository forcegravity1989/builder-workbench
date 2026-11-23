import { describe, expect, it } from 'vitest'
import type { W3AccountStatus } from '../../../../shared/w3-account'
import { toW3AccountView } from './w3-account-view-model'

describe('toW3AccountView', () => {
  it('maps null to loading', () => {
    expect(toW3AccountView(null)).toEqual({ kind: 'loading' })
  })

  it('maps simple states', () => {
    expect(toW3AccountView({ state: 'unconfigured' })).toEqual({ kind: 'unconfigured' })
    expect(toW3AccountView({ state: 'signed-out' })).toEqual({ kind: 'signed-out' })
    expect(toW3AccountView({ state: 'login-pending', sessionProfileId: 'sp1' })).toEqual({
      kind: 'login-pending'
    })
  })

  it('maps signed-in with identity', () => {
    expect(
      toW3AccountView({
        state: 'signed-in',
        sessionProfileId: 'sp1',
        identity: { displayName: 'Ada', employeeNo: 'E1' }
      })
    ).toEqual({ kind: 'signed-in', hasIdentity: true, displayName: 'Ada', employeeNo: 'E1' })
  })

  it('maps signed-in without profile info', () => {
    expect(
      toW3AccountView({ state: 'signed-in', sessionProfileId: 'sp1', identity: null })
    ).toEqual({ kind: 'signed-in', hasIdentity: false, displayName: '', employeeNo: '' })
  })

  it('maps every failure reason through', () => {
    const reasons: W3AccountStatus[] = [
      { state: 'failed', reason: 'not-configured' },
      { state: 'failed', reason: 'timeout' },
      { state: 'failed', reason: 'login-failed' },
      { state: 'failed', reason: 'account-parse-failed' },
      { state: 'failed', reason: 'cancelled' },
      { state: 'failed', reason: 'open-failed' }
    ]
    expect(toW3AccountView(reasons[0])).toEqual({ kind: 'failed', reason: 'not-configured' })
    expect(toW3AccountView(reasons[1])).toEqual({ kind: 'failed', reason: 'timeout' })
    expect(toW3AccountView(reasons[2])).toEqual({ kind: 'failed', reason: 'login-failed' })
    expect(toW3AccountView(reasons[3])).toEqual({ kind: 'failed', reason: 'account-parse-failed' })
    expect(toW3AccountView(reasons[4])).toEqual({ kind: 'failed', reason: 'cancelled' })
    expect(toW3AccountView(reasons[5])).toEqual({ kind: 'failed', reason: 'open-failed' })
  })
})
