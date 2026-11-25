// Why: a team host is shared through one link, so the host cannot tell members apart by the link alone.
// The connecting client names the member in its authentication frame, and the host keeps one record per
// member for the access log, annotation authors and full-access grants. The name is self-declared, which
// is enough inside a trusted team; it is not an authentication factor.
export type RemoteRuntimeCallerIdentity = {
  memberId: string
  name: string
  avatar?: string
}

const MAX_ID_CHARS = 256
const MAX_NAME_CHARS = 256
const MAX_AVATAR_CHARS = 4096

let currentIdentity: RemoteRuntimeCallerIdentity | null = null

export function setRemoteRuntimeCallerIdentity(identity: RemoteRuntimeCallerIdentity | null): void {
  currentIdentity = identity
}

export function getRemoteRuntimeCallerIdentity(): RemoteRuntimeCallerIdentity | null {
  return currentIdentity
}

/** Frame fields to spread into an e2ee_auth payload; empty until the user's team identity is known. */
export function remoteRuntimeAuthCallerFields(): { callerIdentity?: RemoteRuntimeCallerIdentity } {
  return currentIdentity ? { callerIdentity: currentIdentity } : {}
}

export function parseRemoteRuntimeCallerIdentity(
  value: unknown
): RemoteRuntimeCallerIdentity | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const { memberId, name, avatar } = value as Record<string, unknown>
  if (
    typeof memberId !== 'string' ||
    memberId.length === 0 ||
    memberId.length > MAX_ID_CHARS ||
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > MAX_NAME_CHARS
  ) {
    return null
  }
  return {
    memberId,
    name,
    ...(typeof avatar === 'string' && avatar.length > 0 && avatar.length <= MAX_AVATAR_CHARS
      ? { avatar }
      : {})
  }
}
