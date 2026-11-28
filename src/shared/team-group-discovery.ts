// Why: the renderer only ever sees group names plus the two derived IDs. The
// OneBox payloads, the CSRF token and every cookie value stay in the main
// process — the same boundary the W3 account contract draws in
// src/shared/w3-account.ts.

/** One selectable WeLink group space, as OneBox lists it for the signed-in W3 account. */
export type TeamGroupSpaceOption = {
  /** OneBox team-space id; becomes `team_space_id` in BW/team.json. */
  spaceId: string
  name: string
  /** Current member count, shown to tell same-named groups apart. */
  memberCount: number
  /** Group owner display name, shown to tell same-named groups apart. */
  ownerName: string
}

/** Why a group list could not be read, in terms the user can act on. */
export type TeamGroupSpaceListFailure =
  | 'w3-unconfigured'
  | 'w3-not-signed-in'
  | 'onebox-unauthorized'
  | 'rate-limit'
  | 'unreachable'
  | 'parse-failed'

export type TeamGroupSpaceListResult =
  | { ok: true; spaces: TeamGroupSpaceOption[]; truncated: boolean }
  | { ok: false; reason: TeamGroupSpaceListFailure }

/** A space that exists but has no WeLink group behind it (eMeeting spaces). */
export type TeamGroupSpaceResolveFailure = TeamGroupSpaceListFailure | 'not-a-group-space'

export type TeamGroupSpaceResolveResult =
  | { ok: true; spaceId: string; groupId: string }
  | { ok: false; reason: TeamGroupSpaceResolveFailure }
