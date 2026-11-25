import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  ensureW3SessionProfile,
  readW3SessionState,
  type W3SessionRegistry
} from './w3-account-session-store'

it('persists distinct profile bindings and restores the same partition on readback', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'w3-contract-'))
  const profiles = new Map<string, { id: string; partition: string }>()
  const registry: W3SessionRegistry = {
    getProfile: (id) => profiles.get(id) ?? null,
    createProfile: async (scope, label, owner, options) => {
      expect({ scope, label, owner, options }).toEqual({
        scope: 'isolated',
        label: 'W3 Account',
        owner: undefined,
        options: { internal: true }
      })
      const id = `session-${profiles.size}`
      const profile = { id, partition: `persist:${id}` }
      profiles.set(id, profile)
      return profile
    }
  }
  try {
    const ensure = (orcaProfileId: string) =>
      ensureW3SessionProfile({ orcaProfileId, profileDirectory: directory, registry })
    const first = await ensure('alice')
    const second = await ensure('bob')
    expect(second.partition).not.toBe(first.partition)
    expect(readW3SessionState(directory).byOrcaProfileId).toEqual({
      alice: first.profileId,
      bob: second.profileId
    })
    expect(await ensure('alice')).toEqual(first)
    expect(profiles.size).toBe(2)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
