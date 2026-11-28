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

function memberNames(host: TeamDirectoryMember): Set<string> {
  const name = host.name ?? host.member_id
  return new Set([name, `${name}（${host.member_id}）`])
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

function legacyManaged(
  host: TeamDirectoryMember,
  environments: readonly TeamSavedHost[]
): TeamSavedHost[] {
  const names = memberNames(host)
  return environments.filter(
    (environment) =>
      environment.managed && environment.memberId === null && names.has(environment.name)
  )
}

function preferredNamed(
  host: TeamDirectoryMember,
  candidates: readonly TeamSavedHost[]
): TeamSavedHost | undefined {
  const displayName = host.name ?? host.member_id
  return candidates.find((environment) => environment.name === displayName) ?? candidates[0]
}

function uniqueHandAdded(
  host: TeamDirectoryMember,
  environments: readonly TeamSavedHost[]
): TeamSavedHost | undefined {
  const names = memberNames(host)
  const matches = environments.filter(
    (environment) => !environment.managed && names.has(environment.name)
  )
  return matches.length === 1 ? matches[0] : undefined
}

/**
 * Decides how one published team link lands on this computer.
 * Same pairing key updates that saved host. A different key replaces the host previously
 * saved for this member instead of adding a second address. A hand-added host is updated
 * when it is that same key, or when it is the only saved host under this member's name.
 */
export function planTeamHostRefresh(
  host: TeamDirectoryMember,
  offer: TeamPublishedLink,
  environments: readonly TeamSavedHost[]
): TeamHostRefreshPlan {
  const byKey = environments.find((environment) => keyMatches(environment, offer))
  const memberMatches = environments.filter((environment) => sameMember(environment.memberId, host))
  const memberTarget =
    memberMatches.find((environment) => keyMatches(environment, offer)) ?? memberMatches[0]
  const legacy = legacyManaged(host, environments).filter(
    (environment) => environment.id !== byKey?.id && environment.id !== memberTarget?.id
  )
  const target =
    byKey ?? memberTarget ?? preferredNamed(host, legacy) ?? uniqueHandAdded(host, environments)
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
