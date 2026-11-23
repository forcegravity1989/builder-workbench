import { translate } from '@/i18n/i18n'
import {
  REMOTE_SERVER_PAIRING_FAILURE_COPY as EN,
  type RemoteServerPairingFailureCode
} from '../../../shared/remote-server-pairing-failure-copy'

// null = required server name missing; caller shows the host's English `message`.
const COPY: Record<RemoteServerPairingFailureCode, (name: string | null) => string | null> = {
  invalidPairingCode: () =>
    translate('runtime.remoteServerPairingErrors.invalidPairingCode', EN.invalidPairingCode),
  selfPairingCode: () =>
    translate('runtime.remoteServerPairingErrors.selfPairingCode', EN.selfPairingCode),
  alreadyPairedCloudWorkspace: (name) =>
    name === null
      ? null
      : translate(
          'runtime.remoteServerPairingErrors.alreadyPairedCloudWorkspace',
          EN.alreadyPairedCloudWorkspace,
          { name }
        ),
  alreadyPairedCloudIdentity: (name) =>
    name === null
      ? null
      : translate(
          'runtime.remoteServerPairingErrors.alreadyPairedCloudIdentity',
          EN.alreadyPairedCloudIdentity,
          { name }
        ),
  alreadyPairedAddAgain: (name) =>
    name === null
      ? null
      : translate(
          'runtime.remoteServerPairingErrors.alreadyPairedAddAgain',
          EN.alreadyPairedAddAgain,
          {
            name
          }
        ),
  nameTaken: (name) =>
    name === null
      ? null
      : translate('runtime.remoteServerPairingErrors.nameTaken', EN.nameTaken, {
          name
        }),
  idNeedsNewerOrca: () =>
    translate('runtime.remoteServerPairingErrors.idNeedsNewerOrca', EN.idNeedsNewerOrca),
  hostSaveFailed: () =>
    translate('runtime.remoteServerPairingErrors.hostSaveFailed', EN.hostSaveFailed),
  repairSaveFailed: () =>
    translate('runtime.remoteServerPairingErrors.repairSaveFailed', EN.repairSaveFailed),
  repairCloudWorkspace: () =>
    translate('runtime.remoteServerPairingErrors.repairCloudWorkspace', EN.repairCloudWorkspace)
}

function isRemoteServerPairingFailureCode(code: unknown): code is RemoteServerPairingFailureCode {
  return typeof code === 'string' && Object.hasOwn(COPY, code)
}

/** A pairing save failure in the UI language; uncoded (older host) or unknown codes show the English `message`. */
export function remoteServerPairingFailureMessage(failure: {
  message: string
  errorCode?: unknown
  errorParams?: unknown
}): string {
  if (!isRemoteServerPairingFailureCode(failure.errorCode)) {
    return failure.message
  }
  const params =
    typeof failure.errorParams === 'object' && failure.errorParams !== null
      ? failure.errorParams
      : {}
  const name = 'name' in params && typeof params.name === 'string' ? params.name : null
  return COPY[failure.errorCode](name) ?? failure.message
}
