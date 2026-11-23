import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restrictWindowsPath } from '../../shared/secure-path-windows-acl'
import { createShareRecordStore } from './self-hosted-share-records'

const record = (id: string, updatedAt: string) => ({
  id,
  url: `http://share.example.com/s/${id}`,
  editToken: `edit-${id}`,
  expiresAt: '2026-12-16T00:00:00.000Z',
  updatedAt
})

vi.mock('../../shared/secure-path-windows-acl', () => ({
  restrictWindowsPath: vi.fn(async () => true),
  restrictWindowsPathSync: vi.fn(() => true),
  bestEffortRestrictWindowsPath: vi.fn(),
  resetSecureFileWindowsUserSidForTests: vi.fn()
}))

describe('createShareRecordStore', () => {
  let dataDir: string

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'bw-share-records-'))
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('returns nothing for an unknown source', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    await expect(store.get('/repo/a.md')).resolves.toBeNull()
    await expect(store.list()).resolves.toEqual([])
  })

  it('keeps one record per source and lists newest first', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    await store.put('/repo/a.md', record('a', '2026-11-16T00:00:00.000Z'))
    await store.put('/repo/b.md', record('b', '2026-11-17T00:00:00.000Z'))
    await store.put('/repo/a.md', record('a2', '2026-11-18T00:00:00.000Z'))

    await expect(store.get('/repo/a.md')).resolves.toMatchObject({ id: 'a2' })
    await expect(store.list()).resolves.toEqual([
      { sourceKey: '/repo/a.md', record: expect.objectContaining({ id: 'a2' }) },
      { sourceKey: '/repo/b.md', record: expect.objectContaining({ id: 'b' }) }
    ])
  })

  it('removes a record and persists owner-only permissions', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    await store.put('/repo/a.md', record('a', '2026-11-16T00:00:00.000Z'))
    await store.remove('/repo/a.md')

    await expect(store.get('/repo/a.md')).resolves.toBeNull()
    const file = join(dataDir, 'records.json')
    if (process.platform === 'win32') {
      // Windows ignores the 0o600 creation mode, so the ACL restriction is the real guard. The
      // primitive has its own tests; here the contract is that the store asks for it on the
      // published path, which is what the shipping platform needs asserted.
      expect(vi.mocked(restrictWindowsPath)).toHaveBeenCalledWith(file, false)
    } else {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ version: 1 })
  })

  it('quarantines a corrupt index instead of failing every lookup', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    await writeFile(join(dataDir, 'records.json'), '{ broken')

    await expect(store.list()).resolves.toEqual([])
    await store.put('/repo/a.md', record('a', '2026-11-16T00:00:00.000Z'))
    await expect(store.get('/repo/a.md')).resolves.toMatchObject({ id: 'a' })
  })

  it('drops malformed records instead of failing the whole index', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    await writeFile(
      join(dataDir, 'records.json'),
      JSON.stringify({
        version: 1,
        records: {
          '/repo/bad.md': { id: 'bad' },
          '/repo/good.md': record('good', '2026-11-16T00:00:00.000Z')
        }
      })
    )

    await expect(store.get('/repo/bad.md')).resolves.toBeNull()
    await expect(store.get('/repo/good.md')).resolves.toMatchObject({ id: 'good' })
  })

  it('reports a zero-length index as unreadable instead of as "nothing shared"', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    await store.put('/repo/a.md', record('a', '2026-11-16T00:00:00.000Z'))
    // What a rename that outlived a power loss looks like: the name exists, the bytes do not.
    await writeFile(join(dataDir, 'records.json'), '')

    await expect(store.list()).resolves.toEqual([])
    const unreadable = store.unreadableIndex()
    expect(unreadable).toMatchObject({ file: 'records.json' })
    expect(unreadable?.archivedAs).toMatch(/^records\.json\.corrupt-\d+$/)
    await expect(stat(join(dataDir, String(unreadable?.archivedAs)))).resolves.toBeDefined()
  })

  it('reports an index whose records block is missing, not just one that will not parse', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    await writeFile(join(dataDir, 'records.json'), JSON.stringify({ version: 1 }))

    await expect(store.list()).resolves.toEqual([])
    expect(store.unreadableIndex()).toMatchObject({ file: 'records.json' })
  })

  it('reports nothing when the index was simply never written', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })

    await expect(store.list()).resolves.toEqual([])
    expect(store.unreadableIndex()).toBeNull()
  })

  it('stops reporting the index as unreadable once it has written one', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    await writeFile(join(dataDir, 'records.json'), '')
    await expect(store.list()).resolves.toEqual([])
    expect(store.unreadableIndex()).not.toBeNull()

    // The index on disk is now one this process wrote, so the settings page must stop claiming it
    // cannot be read — including after the user deletes their last record.
    await store.put('/repo/a.md', record('a', '2026-11-16T00:00:00.000Z'))
    expect(store.unreadableIndex()).toBeNull()
    await store.remove('/repo/a.md')
    await expect(store.list()).resolves.toEqual([])
    expect(store.unreadableIndex()).toBeNull()
  })

  it('drops expired links on the next write but never one that may still work', async () => {
    const store = createShareRecordStore({ dataDir: () => dataDir })
    const stamp = '2026-11-16T00:00:00.000Z'
    await writeFile(
      join(dataDir, 'records.json'),
      JSON.stringify({
        version: 1,
        records: {
          '/repo/gone.md': {
            ...record('gone', stamp),
            expiresAt: new Date(Date.now() - 1000).toISOString()
          },
          // '' is what the service reports when it keeps links forever.
          '/repo/forever.md': { ...record('forever', stamp), expiresAt: '' },
          '/repo/odd.md': { ...record('odd', stamp), expiresAt: 'not-a-date' }
        }
      })
    )

    // Reads do not prune: what is on disk is what the user is told.
    await expect(store.list()).resolves.toHaveLength(3)

    await store.put('/repo/new.md', record('new', '2026-11-18T00:00:00.000Z'))
    const keys = (await store.list()).map((entry) => entry.sourceKey)
    expect(keys.sort()).toEqual(['/repo/forever.md', '/repo/new.md', '/repo/odd.md'])
  })

  it('never drops a live record to bound the file', async () => {
    // There is deliberately no count cap: dropping the oldest rows would discard links that are
    // still public and still editable, and once the edit token is gone nothing in the product can
    // revoke them. Expiry is the only safe bound.
    const store = createShareRecordStore({ dataDir: () => dataDir })
    const records: Record<string, unknown> = {}
    for (let index = 0; index < 500; index += 1) {
      const updatedAt = new Date(Date.UTC(2026, 0, 1) + index).toISOString()
      records[`/repo/f${index}.md`] = record(`id-${index}`, updatedAt)
    }
    await writeFile(join(dataDir, 'records.json'), JSON.stringify({ version: 1, records }))

    await store.put('/repo/newest.md', record('newest', '2026-11-18T00:00:00.000Z'))

    const listed = await store.list()
    expect(listed).toHaveLength(501)
    expect(listed.some((entry) => entry.sourceKey === '/repo/f0.md')).toBe(true)
    expect(listed.some((entry) => entry.sourceKey === '/repo/newest.md')).toBe(true)
  })
})
