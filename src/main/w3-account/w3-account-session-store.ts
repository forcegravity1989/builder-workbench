// Why: the W3 login must reuse one dedicated persistent browser session per Orca
// profile across restarts. The mapping is persisted by Orca profile id — never by
// label — so a same-named profile can't be mistaken for another profile's session.
// The registry is injected so this module stays free of electron imports.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE_NAME = 'w3-account-session.json'
const SCHEMA_VERSION = 1

export type W3SessionState = {
  schemaVersion: number
  byOrcaProfileId: Record<string, string>
}

/** Minimal surface of the browser session registry that the W3 flow needs. */
export type W3SessionRegistry = {
  getProfile(profileId: string): { id: string; partition: string } | null
  createProfile(
    scope: 'isolated' | 'imported',
    label: string,
    options?: { internal?: boolean }
  ): Promise<{ id: string; partition: string } | null>
}

export function w3SessionStatePath(profileDirectory: string): string {
  return join(profileDirectory, FILE_NAME)
}

export function readW3SessionState(profileDirectory: string): W3SessionState {
  const path = w3SessionStatePath(profileDirectory)
  try {
    if (!existsSync(path)) {
      return { schemaVersion: SCHEMA_VERSION, byOrcaProfileId: {} }
    }
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<W3SessionState>
    const map =
      raw && typeof raw.byOrcaProfileId === 'object' && raw.byOrcaProfileId !== null
        ? raw.byOrcaProfileId
        : {}
    const byOrcaProfileId: Record<string, string> = {}
    for (const [key, value] of Object.entries(map)) {
      if (typeof value === 'string' && value) {
        byOrcaProfileId[key] = value
      }
    }
    return { schemaVersion: SCHEMA_VERSION, byOrcaProfileId }
  } catch {
    return { schemaVersion: SCHEMA_VERSION, byOrcaProfileId: {} }
  }
}

export function writeW3SessionState(profileDirectory: string, state: W3SessionState): void {
  try {
    writeFileSync(w3SessionStatePath(profileDirectory), JSON.stringify(state), 'utf8')
  } catch {
    // Why: persistence is best-effort; a failure degrades to re-creating the W3
    // browser session profile, never to authenticating with a stale identity.
  }
}

/**
 * Ensure a stable dedicated W3 browser session profile exists for this Orca profile.
 * Reuses the persisted profile when the registry still knows it; otherwise creates a
 * new isolated profile and rewrites the mapping (covers deletion / invalidation).
 */
export async function ensureW3SessionProfile(args: {
  orcaProfileId: string
  profileDirectory: string
  registry: W3SessionRegistry
}): Promise<{ profileId: string; partition: string }> {
  const state = readW3SessionState(args.profileDirectory)
  const existingId = state.byOrcaProfileId[args.orcaProfileId]
  if (existingId) {
    const existing = args.registry.getProfile(existingId)
    if (existing) {
      return { profileId: existing.id, partition: existing.partition }
    }
  }
  const created = await args.registry.createProfile('isolated', 'W3 Account', { internal: true })
  if (!created) {
    throw new Error('w3_session_profile_unavailable')
  }
  state.byOrcaProfileId[args.orcaProfileId] = created.id
  writeW3SessionState(args.profileDirectory, state)
  return { profileId: created.id, partition: created.partition }
}
