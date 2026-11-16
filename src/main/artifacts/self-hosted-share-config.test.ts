import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createShareConfigStore,
  normalizeShareServerUrl,
  shareConfigView
} from './self-hosted-share-config'

describe('normalizeShareServerUrl', () => {
  it('keeps http(s) origins and path prefixes without trailing slashes', () => {
    expect(normalizeShareServerUrl(' http://7.192.170.220:8787/ ')).toBe(
      'http://7.192.170.220:8787'
    )
    expect(normalizeShareServerUrl('https://share.example.com/base/')).toBe(
      'https://share.example.com/base'
    )
  })

  it('treats an empty address as not configured', () => {
    expect(normalizeShareServerUrl('  ')).toBe('')
  })

  it.each([
    'ftp://share.example.com',
    'share.example.com:8787',
    'http://user:pass@share.example.com',
    'http://share.example.com/?token=1',
    'http://share.example.com/#top'
  ])('rejects %s', (value) => {
    expect(() => normalizeShareServerUrl(value)).toThrow()
  })
})

describe('shareConfigView', () => {
  it('never exposes the upload token', () => {
    expect(
      shareConfigView({ serverUrl: 'http://7.192.170.220:8787', uploadToken: 'secret' })
    ).toEqual({
      serverUrl: 'http://7.192.170.220:8787',
      uploadTokenSet: true,
      configured: true
    })
    expect(shareConfigView({ serverUrl: '', uploadToken: '' }).configured).toBe(false)
  })
})

describe('createShareConfigStore', () => {
  let dataDir: string

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'bw-share-config-'))
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('starts unconfigured', async () => {
    const store = createShareConfigStore({ dataDir: () => dataDir })
    await expect(store.read()).resolves.toEqual({ serverUrl: '', uploadToken: '' })
  })

  it('persists the address and token with owner-only permissions', async () => {
    const store = createShareConfigStore({ dataDir: () => dataDir })
    await store.save({
      serverUrl: 'http://7.192.170.220:8787/',
      uploadToken: '  secret-token  '
    })

    await expect(store.read()).resolves.toEqual({
      serverUrl: 'http://7.192.170.220:8787',
      uploadToken: 'secret-token'
    })
    const file = join(dataDir, 'config.json')
    if (process.platform !== 'win32') {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ version: 1 })
  })

  it('keeps the stored token when the update omits it', async () => {
    const store = createShareConfigStore({ dataDir: () => dataDir })
    await store.save({ serverUrl: 'http://old:8787', uploadToken: 'secret-token' })
    await store.save({ serverUrl: 'http://new:8787' })

    await expect(store.read()).resolves.toEqual({
      serverUrl: 'http://new:8787',
      uploadToken: 'secret-token'
    })
  })

  it('clears the token when the update sends an empty string', async () => {
    const store = createShareConfigStore({ dataDir: () => dataDir })
    await store.save({ serverUrl: 'http://old:8787', uploadToken: 'secret-token' })
    await store.save({ serverUrl: 'http://old:8787', uploadToken: '' })

    await expect(store.read()).resolves.toEqual({
      serverUrl: 'http://old:8787',
      uploadToken: ''
    })
  })

  it('quarantines a corrupt file so the form and saves keep working', async () => {
    const store = createShareConfigStore({ dataDir: () => dataDir })
    await writeFile(join(dataDir, 'config.json'), '{ not json')

    await expect(store.read()).resolves.toEqual({ serverUrl: '', uploadToken: '' })
    await store.save({ serverUrl: 'http://new:8787', uploadToken: 'secret-token' })
    await expect(store.read()).resolves.toEqual({
      serverUrl: 'http://new:8787',
      uploadToken: 'secret-token'
    })
  })

  it('rejects invalid addresses without overwriting the stored config', async () => {
    const store = createShareConfigStore({ dataDir: () => dataDir })
    await store.save({ serverUrl: 'http://old:8787', uploadToken: 'secret-token' })
    await expect(store.save({ serverUrl: 'ftp://bad' })).rejects.toThrow()

    await expect(store.read()).resolves.toMatchObject({ serverUrl: 'http://old:8787' })
  })
})
