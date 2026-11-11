import {
  isEphemeralVmRuntimeEnvironment,
  type KnownRuntimeEnvironment,
  type RuntimeEnvironmentSource
} from './runtime-environments'
import { remoteServerPairingStoreError } from './runtime-environment-store-records'

/** Refuses folding a new code into a saved server that another flow owns, naming that server. */
export function assertPairingReplaceableByAdd(
  environment: KnownRuntimeEnvironment,
  source: RuntimeEnvironmentSource | undefined,
  refreshable: boolean
): void {
  const named = { name: environment.name }
  // Why: a cloud workspace pairs its own server on resume; a hand-made pairing would be swept with it.
  if (isEphemeralVmRuntimeEnvironment(environment)) {
    throw remoteServerPairingStoreError('alreadyPairedCloudWorkspace', named)
  }
  if (source === 'ephemeral-vm') {
    throw remoteServerPairingStoreError('alreadyPairedCloudIdentity', named)
  }
  // Why: only the app holding this server's connections can switch them to a new pairing.
  if (!refreshable) {
    throw remoteServerPairingStoreError('alreadyPairedAddAgain', named)
  }
}
