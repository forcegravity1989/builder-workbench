import { readFile, rename } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { writeSecureJsonFileAsync } from '../../shared/secure-file-async'

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
  /** Index this process had to set aside as unreadable, so an empty list is not reported as fact. */
  unreadableIndex: () => { file: string; archivedAs: string | null } | null
} {
  // Serializes the read-modify-write as a whole; the shared writer only serializes the write.
  let writeChain: Promise<unknown> = Promise.resolve()
  let unreadable: { file: string; archivedAs: string | null } | null = null
  const recordsPath = (): string => join(options.dataDir(), 'records.json')

  async function readAll(): Promise<Record<string, ShareRecord>> {
    let raw: string
    try {
      raw = await readFile(recordsPath(), 'utf8')
    } catch (error) {
      // "No file yet" is the ordinary first run. Every other failure means the bytes were never
      // seen, so setting the file aside would destroy an index that may be perfectly good.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {}
      }
      throw error
    }
    let parsed: Partial<StoredRecords> | null
    try {
      parsed = JSON.parse(raw) as Partial<StoredRecords> | null
    } catch {
      parsed = null
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.records !== 'object') {
      const file = basename(recordsPath())
      unreadable ??= { file, archivedAs: await quarantine(recordsPath()) }
      return {}
    }
    const records: Record<string, ShareRecord> = {}
    let malformed = 0
    for (const [sourceKey, value] of Object.entries(parsed.records ?? {})) {
      if (isShareRecord(value)) {
        records[sourceKey] = value
      } else {
        malformed += 1
      }
    }
    if (malformed > 0) {
      console.error(`Ignored ${malformed} malformed share record(s) in ${basename(recordsPath())}`)
    }
    return records
  }

  function mutate(
    update: (records: Record<string, ShareRecord>) => Record<string, ShareRecord>
  ): Promise<void> {
    const run = writeChain.then(async () => {
      const payload: StoredRecords = {
        version: 1,
        records: pruneExpired(update(await readAll()))
      }
      // Durable: these records hold the only copy of each link's edit token, so a rename that
      // survives a power loss with zero bytes would silently orphan every link this machine made.
      const restricted = await writeSecureJsonFileAsync(recordsPath(), payload, undefined, {
        durable: true
      })
      if (restricted === false) {
        console.error(
          'Workbench share records were saved but their permissions could not be restricted'
        )
      }
      // The index on disk is one this process just wrote, so the earlier "could not read it"
      // verdict no longer describes it. Without this the settings page keeps reporting a failure
      // that sharing has already resolved — and would report it again after the user deletes
      // their last record, when the empty list is the truth.
      unreadable = null
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
    },
    unreadableIndex() {
      return unreadable
    }
  }
}

/** Returns the archived name, or null when the unreadable file could not be moved aside. */
async function quarantine(path: string): Promise<string | null> {
  const archivedAs = `${basename(path)}.corrupt-${Date.now()}`
  try {
    await rename(path, join(dirname(path), archivedAs))
    return archivedAs
  } catch (error) {
    console.error('Failed to quarantine corrupt share data:', error)
    return null
  }
}

/**
 * Links the service has already dropped are not worth keeping: they read as live in the cleanup
 * list and removing one is a no-op the user has to initiate. `''` means the service keeps links
 * forever, and an unparseable stamp is kept rather than guessed at — pruning must never lose a
 * record that may still work.
 *
 * There is deliberately no count cap. Dropping the oldest rows to bound the file would discard
 * records whose links are still public and still editable, and once the edit token is gone nothing
 * in the product can revoke them — the exact orphan this store exists to prevent. Expiry is the only
 * safe bound: what it drops is already a 404 on the server. Growth is bounded in practice by the
 * service's retention window, and a record is ~200 bytes.
 */
function pruneExpired(
  records: Record<string, ShareRecord>,
  now = Date.now()
): Record<string, ShareRecord> {
  const next: Record<string, ShareRecord> = {}
  for (const [sourceKey, record] of Object.entries(records)) {
    const expiry = record.expiresAt ? Date.parse(record.expiresAt) : Number.NaN
    if (!Number.isNaN(expiry) && expiry <= now) {
      continue
    }
    next[sourceKey] = record
  }
  return next
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
