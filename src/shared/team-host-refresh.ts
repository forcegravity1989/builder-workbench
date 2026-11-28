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
  action: 'add' | 'update' | 'skip'
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
  environments: readonly TeamSavedHost[]
): TeamHostRefreshPlan {
  const byKey = environments.find(
    (environment) =>
      keyMatches(environment, offer) &&
      environment.deviceToken === offer.deviceToken &&
      (environment.memberId === null
        ? environment.managed || environment.accessMode === 'team-read'
        : sameMember(environment.memberId, host))
  )
  const memberMatches = environments.filter((environment) => sameMember(environment.memberId, host))
  const memberTarget =
    memberMatches.find((environment) => keyMatches(environment, offer)) ?? memberMatches[0]
  const legacyName = `${host.name ?? host.member_id}（${host.member_id}）`
  const legacy = environments.filter(
    (environment) =>
      environment.managed && environment.memberId === null && environment.name === legacyName
  )
  const target = memberTarget ?? byKey ?? legacy[0]
  const removeEnvironmentIds = [
    ...memberMatches.filter((environment) => environment.id !== target?.id),
    ...legacy.filter((environment) => environment.id !== target?.id)
  ].map((environment) => environment.id)
  const memberId = host.member_id
  if (!target) {
    return { action: 'add', environmentId: null, removeEnvironmentIds, memberId }
  }
  if (linkAlreadyCurrent(target, offer)) {
    return { action: 'skip', environmentId: target.id, removeEnvironmentIds, memberId }
  }
  return { action: 'update', environmentId: target.id, removeEnvironmentIds, memberId }
}
