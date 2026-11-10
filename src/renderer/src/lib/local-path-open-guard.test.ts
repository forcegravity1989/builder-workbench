import { getLocalPathOpenOwnerForRoute } from '@/lib/local-path-open-guard'
import { describe, expect, it } from 'vitest'
import { isLocalPathOpenBlocked } from './local-path-open-guard'

describe('isLocalPathOpenBlocked', () => {
  it('allows local paths without a runtime or SSH connection', () => {
    expect(
      isLocalPathOpenBlocked(
        getLocalPathOpenOwnerForRoute({
          runtimeEnvironmentId: { activeRuntimeEnvironmentId: null }?.activeRuntimeEnvironmentId
        })
      )
    ).toBe(false)
  })

  it('blocks paths while a runtime environment is active', () => {
    expect(
      isLocalPathOpenBlocked(
        getLocalPathOpenOwnerForRoute({
          runtimeEnvironmentId: { activeRuntimeEnvironmentId: 'env-1' }?.activeRuntimeEnvironmentId
        })
      )
    ).toBe(true)
  })

  it('blocks SSH-backed paths', () => {
    expect(
      isLocalPathOpenBlocked(
        getLocalPathOpenOwnerForRoute({
          runtimeEnvironmentId: { activeRuntimeEnvironmentId: null }?.activeRuntimeEnvironmentId,
          connectionId: 'ssh-1'
        })
      )
    ).toBe(true)
  })
})
