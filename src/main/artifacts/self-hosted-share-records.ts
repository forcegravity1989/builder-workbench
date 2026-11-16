import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Edit token is kept because overwriting or deleting a link must come from this machine. */
export type ShareRecord = {
  id: string
  url: string
  editToken: string
  expiresAt: string
  updatedAt: string
}

type StoredRecords = {
  version: 1
  records: Record<string, ShareRecord>
}

/** Local index of links this machine created, keyed by the file it shared. */
export function createShareRecordStore(options: { dataDir: () => string }): {
  get: (sourceKey: string) => Promise<ShareRecord | null>
  list: () => Promise<{ sourceKey: string; record: ShareRecord }[]>
  put: (sourceKey: string, record: ShareRecord) => Promise<void>
  remove: (sourceKey: string) => Promise<void>
} {
  let writeChain: Promise<unknown> = Promise.resolve()
  const recordsPath = (): string => join(options.dataDir(), 'records.json')

  async function readAll(): Promise<Record<string, ShareRecord>> {
    try {
      const raw = await readFile(recordsPath(), 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoredRecords> | null
      if (!parsed || typeof parsed !== 'object' || typeof parsed.records !== 'object') {
        return {}
      }
      const records: Record<string, ShareRecord> = {}
      for (const [sourceKey, value] of Object.entries(parsed.records ?? {})) {
        if (isShareRecord(value)) {
          records[sourceKey] = value
        }
      }
      return records
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {}
      }
      // A corrupt index must not block every future share; keep the bad file for recovery.
      if (error instanceof SyntaxError) {
        await quarantine(recordsPath())
        return {}
      }
      throw error
    }
  }

  function mutate(
    update: (records: Record<string, ShareRecord>) => Record<string, ShareRecord>
  ): Promise<void> {
    const run = writeChain.then(async () => {
      const records = update(await readAll())
      const path = recordsPath()
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      const payload: StoredRecords = { version: 1, records }
      const temp = `${path}.tmp`
      await writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      })
      await rename(temp, path)
    })
    writeChain = run.catch(() => undefined)
    return run
  }

  return {
    async get(sourceKey) {
      return (await readAll())[sourceKey] ?? null
    },
    async list() {
      const records = await readAll()
      return Object.entries(records)
        .map(([sourceKey, record]) => ({ sourceKey, record }))
        .sort((left, right) => right.record.updatedAt.localeCompare(left.record.updatedAt))
    },
    put(sourceKey, record) {
      return mutate((records) => ({ ...records, [sourceKey]: record }))
    },
    remove(sourceKey) {
      return mutate((records) => {
        const next = { ...records }
        delete next[sourceKey]
        return next
      })
    }
  }
}

async function quarantine(path: string): Promise<void> {
  try {
    await rename(path, `${path}.corrupt-${Date.now()}`)
  } catch (error) {
    console.error('Failed to quarantine corrupt share data:', error)
  }
}

function isShareRecord(value: unknown): value is ShareRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.url === 'string' &&
    typeof record.editToken === 'string' &&
    typeof record.expiresAt === 'string' &&
    typeof record.updatedAt === 'string'
  )
}
