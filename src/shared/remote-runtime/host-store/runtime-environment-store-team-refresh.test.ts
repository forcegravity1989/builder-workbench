import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { removeTempDirs } from '../../testing/remove-temp-dirs.test-support'
import { encodePairingOffer } from '../pairing/pairing'
import {
  addEnvironmentFromPairingCode,
  listEnvironments,
  removeEnvironment,
  updateEnvironmentFromPairingCode
} from './runtime-environment-store-operations'

it('protects occupied host keys and refuses deletion based on a stale pairing revision', async () => {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-team-refresh-'))
  const code = (key: number, address: string) =>
    encodePairingOffer({
      v: 2,
      endpoint: `wss://${address}.example/runtime`,
      publicKeyB64: Buffer.alloc(32, key).toString('base64'),
      deviceToken: 'test-device-token'
    })
  try {
    const old = addEnvironmentFromPairingCode(userDataPath, {
      name: 'Team',
      pairingCode: code(1, 'old'),
      now: 100
    })
    const manual = addEnvironmentFromPairingCode(userDataPath, {
      name: 'Manual',
      pairingCode: code(2, 'manual'),
      now: 100
    })
    const plannedRevision = old.pairingRevision ?? old.createdAt
    expect(() =>
      updateEnvironmentFromPairingCode(userDataPath, old.id, {
        pairingCode: code(2, 'manual'),
        expectedPairingRevision: plannedRevision,
        rejectDuplicateHostKey: true
      })
    ).toThrow()
    expect(listEnvironments(userDataPath).find(({ id }) => id === old.id)?.endpoints).toEqual(
      old.endpoints
    )

    const updated = updateEnvironmentFromPairingCode(userDataPath, old.id, {
      pairingCode: code(1, 'new'),
      expectedPairingRevision: plannedRevision,
      rejectDuplicateHostKey: true,
      now: 200
    })
    expect(() =>
      removeEnvironment(userDataPath, old.id, { expectedPairingRevision: plannedRevision })
    ).toThrow('The saved pairing changed before removal.')
    expect(listEnvironments(userDataPath).map(({ id }) => id)).toEqual([manual.id, updated.id])
    expect(
      removeEnvironment(userDataPath, old.id, { expectedPairingRevision: updated.pairingRevision })
        .id
    ).toBe(old.id)
  } finally {
    await removeTempDirs([userDataPath])
  }
})
