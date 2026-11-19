import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createShareRecordStore } from './self-hosted-share-records'

const record = (id: string, updatedAt: string) => ({
  id,
  url: `http://share.example.com/s/${id}`,
  editToken: `edit-${id}`,
  expiresAt: '2026-12-16T00:00:00.000Z',
  updatedAt
})

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
    if (process.platform !== 'win32') {
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
})
