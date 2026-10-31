import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MilestoneRecoveryRecordSchema,
  type MilestoneRecoveryRecord,
  type MilestoneRecoveryWrite
} from '../../shared/workbench/milestone-recovery'
import { durableWriteTempPath, writeFileDurable } from '../durable-file-write'

const MAX_RECOVERY_BYTES = 20 * 1024 * 1024

/** Client-local recovery only. Committed project materials never pass through this store. */
export function createMilestoneRecoveryStore(directory: () => string) {
  const pending = new Map<string, Promise<unknown>>()
  const file = (key: string) =>
    join(directory(), `${createHash('sha256').update(key).digest('hex')}.json`)
  const serial = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const job = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(operation)
    pending.set(key, job)
    void job
      .finally(() => {
        if (pending.get(key) === job) {
          pending.delete(key)
        }
      })
      .catch(() => {})
    return job
  }
  async function read(key: string): Promise<MilestoneRecoveryRecord> {
    try {
      const path = file(key)
      const info = await lstat(path)
      if (!info.isFile() || info.size > MAX_RECOVERY_BYTES) {
        throw new Error('本机草案恢复记录不是有效文件，原记录保留')
      }
      return MilestoneRecoveryRecordSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { revision: null, payload: null }
      }
      throw error
    }
  }
  return {
    read: (key: string) => serial(key, () => read(key)),
    write: (request: MilestoneRecoveryWrite) =>
      serial(request.key, async () => {
        const previous = await read(request.key)
        if (previous.revision !== request.expectedRevision) {
          throw new Error('另一窗口已更新本机恢复记录，当前输入保留；请核对后再退出')
        }
        const record = { revision: randomUUID(), payload: request.payload }
        const serialized = JSON.stringify(record)
        if (Buffer.byteLength(serialized, 'utf8') > MAX_RECOVERY_BYTES) {
          throw new Error('本机草案超过恢复记录大小限制，原记录保留')
        }
        await mkdir(directory(), { recursive: true, mode: 0o700 })
        const path = file(request.key)
        // A durable tombstone also advances CAS, so a stale empty window cannot revive discarded input.
        await writeFileDurable(durableWriteTempPath(path), path, serialized)
        return record
      })
  }
}
