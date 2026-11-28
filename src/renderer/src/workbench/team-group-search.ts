import type { TeamGroupSpaceOption } from '../../../shared/team-group-discovery'

/**
 * Narrow the group list locally: OneBox has no server-side name filter, so the
 * whole list arrives once and matching happens here. Prefix hits rank above
 * substring hits so the closest match is reachable without scrolling; within a
 * rank the server order (newest space first) is preserved.
 */
export function searchTeamGroupSpaces(
  spaces: readonly TeamGroupSpaceOption[],
  query: string
): TeamGroupSpaceOption[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return [...spaces]
  }
  const prefix: TeamGroupSpaceOption[] = []
  const substring: TeamGroupSpaceOption[] = []
  for (const space of spaces) {
    const name = space.name.toLowerCase()
    if (name.startsWith(needle)) {
      prefix.push(space)
    } else if (name.includes(needle)) {
      substring.push(space)
    }
  }
  return [...prefix, ...substring]
}

/** Second line under a name: the two facts that tell same-named groups apart. */
export function teamGroupSpaceDetail(space: TeamGroupSpaceOption): string {
  const parts: string[] = []
  if (space.memberCount > 0) {
    parts.push(`${space.memberCount} 人`)
  }
  if (space.ownerName !== '') {
    parts.push(`群主 ${space.ownerName}`)
  }
  return parts.join(' · ')
}
