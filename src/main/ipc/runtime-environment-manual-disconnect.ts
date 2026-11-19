import { listEnvironments } from '../../shared/runtime-environment-store'

const manuallyDisconnectedEnvironmentIds = new Set<string>()
let hydratedUserDataPath: string | null = null

export const RUNTIME_MANUALLY_DISCONNECTED_MESSAGE = 'Runtime environment is manually disconnected.'

/**
 * Rebuilds the in-session holds from saved per-host reconnect preferences.
 * Must run before any status probe/activation so a held host is never dialed at launch.
 */
export function hydrateRuntimeEnvironmentManualDisconnects(userDataPath: string): void {
  if (hydratedUserDataPath === userDataPath) {
    return
  }
  hydratedUserDataPath = userDataPath
  // Why clear: a different profile in the same process must not inherit another profile's holds.
  manuallyDisconnectedEnvironmentIds.clear()
  try {
    for (const environment of listEnvironments(userDataPath)) {
      if (environment.reconnectOnLaunch === false) {
        manuallyDisconnectedEnvironmentIds.add(environment.id)
      }
    }
  } catch (error) {
    console.warn('[runtime-environments] failed to read saved reconnect preferences:', error)
  }
}

/** Test-only: forget the hydrated profile so a process restart can be simulated. */
export function resetRuntimeEnvironmentManualDisconnects(): void {
  hydratedUserDataPath = null
  manuallyDisconnectedEnvironmentIds.clear()
}

export function markRuntimeEnvironmentManuallyDisconnected(environmentId: string): void {
  manuallyDisconnectedEnvironmentIds.add(environmentId)
}

export function clearRuntimeEnvironmentManualDisconnect(environmentId: string): void {
  manuallyDisconnectedEnvironmentIds.delete(environmentId)
}

export function isRuntimeEnvironmentManuallyDisconnected(environmentId: string): boolean {
  return manuallyDisconnectedEnvironmentIds.has(environmentId)
}
