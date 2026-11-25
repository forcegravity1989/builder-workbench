import {
  resolveEnvironment,
  setEnvironmentReconnectOnLaunch
} from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import type { VerifyAndAddRuntimeEnvironmentResult } from '../../../../shared/remote-runtime/pairing/remote-pairing-verification'
import { withRuntimeEnvironmentStatusOwner } from '../connections/runtime-environment-request-connections'
import { clearRuntimeEnvironmentManualDisconnect } from '../connectivity/runtime-environment-manual-disconnect'

type VerifiedPairing = Extract<VerifyAndAddRuntimeEnvironmentResult, { ok: true }>

/** Retire replaced owners before publishing verified status; reject overlapping saves by pairing revision. */
export async function publishVerifiedPairing(
  userDataPath: string,
  result: VerifiedPairing,
  replaced: { invalidateTransport: (environmentId: string) => Promise<void> | void } | null
): Promise<void> {
  const environmentId = result.environment.id
  try {
    const saved = await setEnvironmentReconnectOnLaunch(userDataPath, environmentId, undefined, {
      expectedPairingRevision: result.environment.pairingRevision
    })
    if (!saved) {
      return
    }
  } catch (error) {
    console.warn('[runtime-environments] failed to clear saved reconnect preference:', error)
    const saved = await resolveEnvironment(userDataPath, environmentId).catch(() => null)
    if (!saved || saved.pairingRevision !== result.environment.pairingRevision) {
      return
    }
  }
  // Explicit re-pair clears the hold so invalidation can create the new status owner.
  clearRuntimeEnvironmentManualDisconnect(environmentId)
  await replaced?.invalidateTransport(environmentId)
  await withRuntimeEnvironmentStatusOwner(userDataPath, environmentId, (environment, owner) => {
    if (environment.pairingRevision !== result.environment.pairingRevision) {
      return
    }
    owner.acceptVerified({
      id: 'status.get',
      ok: true,
      result: result.runtimeStatus,
      _meta: { runtimeId: result.runtimeStatus.runtimeId }
    })
  }).catch(() => {
    /* A removed or unreadable registry delays status until the next probe. */
  })
}
