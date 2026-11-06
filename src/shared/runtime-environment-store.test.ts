import { mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodePairingOffer } from './pairing'
import {
  RuntimeEnvironmentStoreError,
  addEnvironmentFromPairingCode,
  addOrUpdateEnvironmentFromPairingCode,
  getEnvironmentStorePath,
  listEnvironments,
  MAX_RUNTIME_ENVIRONMENT_STORE_FILE_BYTES,
  markEnvironmentUsed,
  updateEnvironmentFromPairingCode
} from './runtime-environment-store'

function pairingCode(
  endpoint = 'ws://127.0.0.1:6768',
  pairedDeviceId?: string,
  hostKeyByte = 1
): string {
  return encodePairingOffer({
    v: 2,
    endpoint,
    deviceToken: 'device-token',
    publicKeyB64: Buffer.from(new Uint8Array(32).fill(hostKeyByte)).toString('base64'),
    ...(pairedDeviceId ? { pairedDeviceId } : {})
  })
}

describe('runtime environment store', () => {
  const tempDirs: string[] = []
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')

  beforeEach(() => {
    // Why: this suite tests store timestamps, while secure-file tests cover Windows ACLs.
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
  })

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects duplicate host keys and normalized names before replacing saved servers', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-store-'))
    tempDirs.push(userDataPath)

    const first = addEnvironmentFromPairingCode(userDataPath, {
      name: 'dev box',
      pairingCode: pairingCode('ws://127.0.0.1:6768')
    })

    expect(() =>
      addEnvironmentFromPairingCode(userDataPath, {
        name: 'dev box',
        pairingCode: pairingCode('ws://192.0.2.10:6768')
      })
    ).toThrow(RuntimeEnvironmentStoreError)
    expect(() =>
      addEnvironmentFromPairingCode(userDataPath, {
        name: '"DEV BOX"',
        pairingCode: pairingCode('ws://192.0.2.10:6768', undefined, 2)
      })
    ).toThrow('already exists')
    expect(listEnvironments(userDataPath)).toEqual([first])
  })

  it('refreshes a verified host in place without respelling its fingerprint key', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-repair-'))
    tempDirs.push(userDataPath)
    const first = addEnvironmentFromPairingCode(userDataPath, {
      name: 'dev box',
      pairingCode: pairingCode(),
      now: 100
    })
    markEnvironmentUsed(userDataPath, first.id, { runtimeId: 'before', now: 110 })
    const outcome = addOrUpdateEnvironmentFromPairingCode(userDataPath, {
      name: 'new label',
      pairingCode: encodePairingOffer({
        v: 2,
        endpoint: 'ws://192.0.2.10:6768',
        deviceToken: 'replacement',
        publicKeyB64: first.endpoints[0]!.publicKeyB64.replace(/=+$/, '')
      }),
      runtimeId: 'after',
      now: 100
    })
    expect(outcome.updatedExisting).toBe(true)
    expect(outcome.environment).toMatchObject({
      id: first.id,
      name: first.name,
      createdAt: 100,
      lastUsedAt: 110,
      pairingRevision: 101,
      runtimeId: 'after'
    })
    expect(outcome.environment.endpoints[0]!.publicKeyB64).toBe(first.endpoints[0]!.publicKeyB64)
    expect(listEnvironments(userDataPath)).toHaveLength(1)
  })

  it('ignores identity from an old pairing after credentials rotate', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-fence-'))
    tempDirs.push(userDataPath)
    const environment = addEnvironmentFromPairingCode(userDataPath, {
      name: 'dev box',
      pairingCode: pairingCode()
    })
    markEnvironmentUsed(userDataPath, environment.id, {
      runtimeId: 'current-runtime',
      pairedDeviceId: 'current-device',
      pairingDeviceToken: 'device-token',
      now: 100
    })
    markEnvironmentUsed(userDataPath, environment.id, {
      runtimeId: 'old-runtime',
      pairedDeviceId: 'old-device',
      pairingDeviceToken: 'retired-token',
      now: 200
    })
    markEnvironmentUsed(userDataPath, environment.id, { pairedDeviceId: 'unfenced-device' })
    expect(listEnvironments(userDataPath)[0]).toMatchObject({
      runtimeId: 'current-runtime',
      pairedDeviceId: 'current-device'
    })
  })

  it('preserves unreadable records and fails closed on blank reads before save recovery', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-records-'))
    tempDirs.push(userDataPath)
    const path = getEnvironmentStorePath(userDataPath)
    const future = { id: 'future', kind: 'new-kind', opaque: ['keep', 1] }
    writeFileSync(path, JSON.stringify({ version: 1, environments: [future] }))
    const added = addEnvironmentFromPairingCode(userDataPath, {
      name: 'dev box',
      pairingCode: pairingCode()
    })
    expect(listEnvironments(userDataPath)).toEqual([added])
    expect(JSON.parse(readFileSync(path, 'utf8')).environments).toContainEqual(future)
    writeFileSync(path, '\0 \n\0')
    expect(() => listEnvironments(userDataPath)).toThrow(RuntimeEnvironmentStoreError)
    addEnvironmentFromPairingCode(userDataPath, { name: 'recovered', pairingCode: pairingCode() })
    expect(listEnvironments(userDataPath)[0]!.name).toBe('recovered')
  })

  it('advances pairing revisions across equal and backward clock readings', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-store-'))
    tempDirs.push(userDataPath)
    const environment = addEnvironmentFromPairingCode(userDataPath, {
      name: 'dev box',
      pairingCode: pairingCode(),
      now: 100
    })

    const sameClock = updateEnvironmentFromPairingCode(userDataPath, environment.id, {
      pairingCode: pairingCode('ws://192.0.2.10:6768'),
      now: 100
    })
    const backwardClock = updateEnvironmentFromPairingCode(userDataPath, environment.id, {
      pairingCode: pairingCode('ws://192.0.2.11:6768'),
      now: 50
    })
    const laterClock = updateEnvironmentFromPairingCode(userDataPath, environment.id, {
      pairingCode: pairingCode('ws://192.0.2.12:6768'),
      now: 200
    })

    expect([
      sameClock.pairingRevision,
      backwardClock.pairingRevision,
      laterClock.pairingRevision
    ]).toEqual([101, 102, 200])
  })

  it('keeps SSH-tunnel metadata only while the pairing endpoint is loopback', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-store-'))
    tempDirs.push(userDataPath)
    const environment = addEnvironmentFromPairingCode(userDataPath, {
      name: 'tunneled box',
      pairingCode: pairingCode(),
      connectionDependency: 'ssh-tunnel'
    })
    expect(environment.connectionDependency).toBe('ssh-tunnel')

    const updated = updateEnvironmentFromPairingCode(userDataPath, environment.id, {
      pairingCode: pairingCode('ws://192.0.2.10:6768')
    })
    expect(updated).not.toHaveProperty('connectionDependency')

    const direct = addEnvironmentFromPairingCode(userDataPath, {
      name: 'direct box',
      pairingCode: pairingCode('ws://192.0.2.11:6768', undefined, 2),
      connectionDependency: 'ssh-tunnel'
    })
    expect(direct).not.toHaveProperty('connectionDependency')
  })

  it('throttles lastUsedAt writes so it does not rewrite the store on every runtime call', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-store-'))
    tempDirs.push(userDataPath)
    const env = addEnvironmentFromPairingCode(userDataPath, {
      name: 'dev box',
      pairingCode: pairingCode()
    })

    // First use persists (lastUsedAt started null).
    markEnvironmentUsed(userDataPath, env.id, { runtimeId: 'runtime-1', now: 1_000 })
    expect(listEnvironments(userDataPath)[0]).toMatchObject({
      lastUsedAt: 1_000,
      runtimeId: 'runtime-1'
    })

    // A second use shortly after, same runtime, is skipped — lastUsedAt stays put.
    markEnvironmentUsed(userDataPath, env.id, { runtimeId: 'runtime-1', now: 5_000 })
    expect(listEnvironments(userDataPath)[0]!.lastUsedAt).toBe(1_000)

    // Once the throttle window elapses, it persists again.
    markEnvironmentUsed(userDataPath, env.id, { runtimeId: 'runtime-1', now: 61_000 })
    expect(listEnvironments(userDataPath)[0]!.lastUsedAt).toBe(61_000)
  })

  it('persists immediately when the runtimeId changes within the throttle window', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-store-'))
    tempDirs.push(userDataPath)
    const env = addEnvironmentFromPairingCode(userDataPath, {
      name: 'dev box',
      pairingCode: pairingCode()
    })

    markEnvironmentUsed(userDataPath, env.id, { runtimeId: 'runtime-1', now: 1_000 })
    // A different runtimeId inside the window must not be dropped.
    markEnvironmentUsed(userDataPath, env.id, { runtimeId: 'runtime-2', now: 2_000 })
    expect(listEnvironments(userDataPath)[0]).toMatchObject({
      lastUsedAt: 2_000,
      runtimeId: 'runtime-2'
    })
  })

  it('persists paired device identity from pairing and status backfill', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-store-'))
    tempDirs.push(userDataPath)
    const paired = addEnvironmentFromPairingCode(userDataPath, {
      name: 'paired box',
      pairingCode: pairingCode('ws://127.0.0.1:6768', 'device-from-offer'),
      now: 1_000
    })
    const legacy = addEnvironmentFromPairingCode(userDataPath, {
      name: 'legacy box',
      pairingCode: pairingCode('ws://192.0.2.10:6768', undefined, 2),
      now: 1_000
    })

    expect(paired.pairedDeviceId).toBe('device-from-offer')
    markEnvironmentUsed(userDataPath, legacy.id, {
      pairedDeviceId: 'device-from-status',
      pairingDeviceToken: 'device-token',
      now: 2_000
    })
    expect(listEnvironments(userDataPath).find((entry) => entry.id === legacy.id)).toMatchObject({
      pairedDeviceId: 'device-from-status',
      lastUsedAt: 2_000
    })
  })

  it('rejects an oversized sparse environment store before parsing it', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-store-bound-'))
    tempDirs.push(userDataPath)
    const path = getEnvironmentStorePath(userDataPath)
    writeFileSync(path, '{"version":1,"environments":[]}')
    truncateSync(path, MAX_RUNTIME_ENVIRONMENT_STORE_FILE_BYTES + 1)

    expect(() => listEnvironments(userDataPath)).toThrow(RuntimeEnvironmentStoreError)
  })

  it('rejects an oversized write without replacing the durable environment list', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-env-store-write-bound-'))
    tempDirs.push(userDataPath)
    const first = addEnvironmentFromPairingCode(userDataPath, {
      name: 'dev box',
      pairingCode: pairingCode()
    })

    expect(() =>
      addEnvironmentFromPairingCode(userDataPath, {
        name: 'x'.repeat(MAX_RUNTIME_ENVIRONMENT_STORE_FILE_BYTES),
        pairingCode: pairingCode('ws://192.0.2.10:6768', undefined, 2)
      })
    ).toThrow(RuntimeEnvironmentStoreError)
    expect(listEnvironments(userDataPath)).toEqual([first])
  })
})
