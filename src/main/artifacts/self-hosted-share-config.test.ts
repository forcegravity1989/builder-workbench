import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restrictWindowsPath } from '../../shared/secure-storage/secure-path-windows-acl'
import {
  createShareTokenStore,
  SHARE_ENROLL_KEY,
  SHARE_SERVER_URL
} from './self-hosted-share-config'

vi.mock('../../shared/secure-storage/secure-path-windows-acl', () => ({
  restrictWindowsPath: vi.fn(async () => true),
  restrictWindowsPathSync: vi.fn(() => true),
  bestEffortRestrictWindowsPath: vi.fn(),
  resetSecureFileWindowsUserSidForTests: vi.fn()
}))

describe('share deployment constants', () => {
  it('hardcodes the service address and enrollment key', () => {
    expect(SHARE_SERVER_URL).toBe('http://7.192.170.220:8787')
    expect(SHARE_ENROLL_KEY).toMatch(/^bwshare-enroll-/)
  })
})

describe('createShareTokenStore', () => {
  let dataDir: string

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'bw-share-config-'))
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('starts without a token', async () => {
    const store = createShareTokenStore({ dataDir: () => dataDir })
    await expect(store.read()).resolves.toBe('')
  })

  it('persists the token with owner-only permissions', async () => {
    const store = createShareTokenStore({ dataDir: () => dataDir })
    await store.save('  secret-token  ')

    await expect(store.read()).resolves.toBe('secret-token')
    const file = join(dataDir, 'config.json')
    if (process.platform === 'win32') {
      // Windows ignores the 0o600 creation mode, so the ACL restriction is the real guard. The
      // primitive has its own tests; here the contract is that the store asks for it on the
      // published path, which is what the shipping platform needs asserted.
      expect(vi.mocked(restrictWindowsPath)).toHaveBeenCalledWith(file, false)
    } else {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      version: 2,
      uploadToken: 'secret-token'
    })
  })

  it('clears the token when the update sends an empty string', async () => {
    const store = createShareTokenStore({ dataDir: () => dataDir })
    await store.save('secret-token')
    await store.save('')

    await expect(store.read()).resolves.toBe('')
  })

  it('ignores the retired server address from a v1 file', async () => {
    const store = createShareTokenStore({ dataDir: () => dataDir })
    await writeFile(
      join(dataDir, 'config.json'),
      JSON.stringify({ version: 1, serverUrl: 'http://old:8787', uploadToken: 'secret-token' })
    )

    await expect(store.read()).resolves.toBe('secret-token')
  })

  it('quarantines a corrupt file so sharing can enroll again', async () => {
    const store = createShareTokenStore({ dataDir: () => dataDir })
    await writeFile(join(dataDir, 'config.json'), '{ not json')

    await expect(store.read()).resolves.toBe('')
    await store.save('fresh-token')
    await expect(store.read()).resolves.toBe('fresh-token')
  })
})
