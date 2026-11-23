// One English table for Remote Orca Server pairing save failures: main builds the wire `message`, the renderer translates by code.
export const REMOTE_SERVER_PAIRING_FAILURE_COPY = {
  invalidPairingCode:
    'Invalid pairing code. Expected an orca://pair?... URL or bare pairing payload.',
  selfPairingCode:
    'This pairing code is for this Orca itself. Generate the code on the other computer instead.',
  alreadyPairedCloudWorkspace:
    'This server is already paired as "{{name}}". It belongs to a cloud workspace, which pairs it again when it resumes.',
  alreadyPairedCloudIdentity:
    'This server is already paired as "{{name}}". The cloud workspace\'s server reuses that server\'s identity, so it was not saved.',
  alreadyPairedAddAgain:
    'This server is already paired as "{{name}}". To update its connection, add it again under Settings > Remote Orca Servers.',
  nameTaken: 'A server named "{{name}}" already exists.',
  idNeedsNewerOrca:
    'A server with this id already exists in a format that needs a newer version of Orca.',
  hostSaveFailed:
    'Orca verified the host but could not save it. Check local settings storage and try again.',
  repairSaveFailed:
    'Orca verified the server but could not save the new pairing. Check local settings storage and try again.',
  repairCloudWorkspace:
    'This server belongs to a cloud workspace, which pairs it again when it resumes.'
} as const

export type RemoteServerPairingFailureCode = keyof typeof REMOTE_SERVER_PAIRING_FAILURE_COPY

export type RemoteServerPairingFailureFields = {
  errorCode: RemoteServerPairingFailureCode
  errorParams?: { name: string }
}

export function remoteServerPairingFailureText(
  code: RemoteServerPairingFailureCode,
  params?: { name: string }
): string {
  return REMOTE_SERVER_PAIRING_FAILURE_COPY[code].replace('{{name}}', () => params?.name ?? '')
}
