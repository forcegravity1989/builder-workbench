import { sameHostKeyB64 } from './remote-runtime/host-catalog/runtime-environment-host-key-match'
import type { TeamDirectoryMember } from './team-directory'

export type TeamSavedHost = {
  id: string
  name: string
  /** Saved earlier by team sync, not typed in by hand. */
  managed: boolean
  memberId: string | null
  endpoint?: string
  deviceToken?: string
  publicKeys: readonly string[]
  accessMode?: 'full' | 'team-read'
}

export type TeamPublishedLink = {
  endpoint: string
  deviceToken: string
  publicKeyB64: string
  accessMode?: 'full' | 'team-read'
}

export type TeamHostRefreshPlan = {
  action: 'add' | 'update' | 'skip' | 'conflict'
  environmentId: string | null
  /** Previous team copies of this member whose address must not stay beside the new one. */
  removeEnvironmentIds: string[]
  memberId: string
}

function sameMember(memberId: string | null | undefined, host: TeamDirectoryMember): boolean {
  return memberId?.toLowerCase() === host.member_id.toLowerCase()
}

function keyMatches(host: TeamSavedHost, offer: TeamPublishedLink): boolean {
  return host.publicKeys.some((key) => sameHostKeyB64(key, offer.publicKeyB64))
}

function linkAlreadyCurrent(saved: TeamSavedHost, offer: TeamPublishedLink): boolean {
  const needsTeamAccess = saved.accessMode === undefined && offer.accessMode === 'team-read'
  return (
    keyMatches(saved, offer) &&
    saved.deviceToken === offer.deviceToken &&
    saved.endpoint === offer.endpoint &&
    !needsTeamAccess
  )
}

export function planTeamHostRefresh(
  host: TeamDirectoryMember,
  offer: TeamPublishedLink,
  environments: readonly TeamSavedHost[],
  hostKeyUniqueInDirectory = false
): TeamHostRefreshPlan {
  const keyOwners = environments.filter((environment) => keyMatches(environment, offer))
  const byPairing = keyOwners.find(
    (environment) =>
      environment.deviceToken === offer.deviceToken &&
      (environment.memberId === null
        ? environment.managed || environment.accessMode === 'team-read'
        : sameMember(environment.memberId, host))
  )
  const memberMatches = environments.filter((environment) => sameMember(environment.memberId, host))
  const legacyName = `${host.name ?? host.member_id}（${host.member_id}）`
  const legacy = environments.filter(
    (environment) =>
      environment.managed && environment.memberId === null && environment.name === legacyName
  )
  const legacyKey = hostKeyUniqueInDirectory
    ? environments.filter(
        (environment) =>
          environment.managed &&
          environment.memberId === null &&
          environment.name === (host.name ?? host.member_id) &&
          keyMatches(environment, offer)
      )
    : []
  const memberId = host.member_id
  const keyOwner = keyOwners[0]
  if (
    keyOwners.length > 1 ||
    (keyOwner &&
      keyOwner !== byPairing &&
      !memberMatches.includes(keyOwner) &&
      !legacy.includes(keyOwner) &&
      !(legacyKey.length === 1 && legacyKey[0] === keyOwner))
  ) {
    return { action: 'conflict', environmentId: null, removeEnvironmentIds: [], memberId }
  }
  const target = keyOwner ?? memberMatches[0] ?? legacy[0]
  const removeEnvironmentIds = [
    ...memberMatches.filter((environment) => environment.id !== target?.id),
    ...legacy.filter((environment) => environment.id !== target?.id)
  ].map((environment) => environment.id)
  if (!target) {
    return { action: 'add', environmentId: null, removeEnvironmentIds, memberId }
  }
  if (linkAlreadyCurrent(target, offer)) {
    return { action: 'skip', environmentId: target.id, removeEnvironmentIds, memberId }
  }
  return { action: 'update', environmentId: target.id, removeEnvironmentIds, memberId }
}
