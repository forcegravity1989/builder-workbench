import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ensureW3SessionProfile,
  readW3SessionState,
  w3SessionStatePath,
  writeW3SessionState,
  type W3SessionRegistry
} from './w3-account-session-store'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'w3-store-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function fakeRegistry(): W3SessionRegistry & { created: number } {
  const profiles = new Map<string, { id: string; partition: string }>()
  let seq = 0
  const registry = {
    created: 0,
    getProfile: (id: string) => profiles.get(id) ?? null,
    createProfile: async (scope: 'isolated' | 'imported', _label: string) => {
      registry.created += 1
      seq += 1
      const profile = { id: `sp-${seq}`, partition: `persist:w3-${seq}-${scope}` }
      profiles.set(profile.id, profile)
      return profile
    }
  }
  return registry
}

describe('readW3SessionState / writeW3SessionState', () => {
  it('returns an empty state when the file is absent or corrupt', () => {
    const dir = tempDir()
    expect(readW3SessionState(dir)).toEqual({ schemaVersion: 1, byOrcaProfileId: {} })
    writeW3SessionState(dir, { schemaVersion: 1, byOrcaProfileId: { p1: 'sp-1' } })
    expect(readW3SessionState(dir).byOrcaProfileId.p1).toBe('sp-1')
    expect(w3SessionStatePath(dir)).toContain('w3-account-session.json')
  })
})

describe('ensureW3SessionProfile', () => {
  it('creates a dedicated isolated profile once and reuses it for the same Orca profile', async () => {
    const dir = tempDir()
    const registry = fakeRegistry()
    const first = await ensureW3SessionProfile({
      orcaProfileId: 'p1',
      profileDirectory: dir,
      registry
    })
    const second = await ensureW3SessionProfile({
      orcaProfileId: 'p1',
      profileDirectory: dir,
      registry
    })
    expect(first).toEqual(second)
    expect(registry.created).toBe(1)
  })

  it('keeps distinct profiles per Orca profile (no label-based cross-match)', async () => {
    const dir = tempDir()
    const registry = fakeRegistry()
    const a = await ensureW3SessionProfile({ orcaProfileId: 'pA', profileDirectory: dir, registry })
    const b = await ensureW3SessionProfile({ orcaProfileId: 'pB', profileDirectory: dir, registry })
    expect(a.profileId).not.toBe(b.profileId)
    expect(readW3SessionState(dir).byOrcaProfileId).toEqual({
      pA: a.profileId,
      pB: b.profileId
    })
  })

  it('recreates the profile when the registry no longer knows the persisted id', async () => {
    const dir = tempDir()
    const registry = fakeRegistry()
    const first = await ensureW3SessionProfile({
      orcaProfileId: 'p1',
      profileDirectory: dir,
      registry
    })
    // Simulate deletion: persisted id remains but registry lost the profile.
    writeW3SessionState(dir, { schemaVersion: 1, byOrcaProfileId: { p1: 'gone-id' } })
    const recreated = await ensureW3SessionProfile({
      orcaProfileId: 'p1',
      profileDirectory: dir,
      registry
    })
    expect(recreated.profileId).not.toBe('gone-id')
    expect(recreated.profileId).not.toBe(first.profileId)
    expect(readW3SessionState(dir).byOrcaProfileId.p1).toBe(recreated.profileId)
  })

  it('throws when the registry cannot create a profile', async () => {
    const dir = tempDir()
    const registry: W3SessionRegistry = {
      getProfile: () => null,
      createProfile: async () => null
    }
    await expect(
      ensureW3SessionProfile({ orcaProfileId: 'p1', profileDirectory: dir, registry })
    ).rejects.toThrow('w3_session_profile_unavailable')
  })
})
