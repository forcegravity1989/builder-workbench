import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MilestoneRecoveryRecordSchema,
  type MilestoneRecoveryRecord
} from '../../shared/monica/milestone-recovery'
import { isMissingFile } from './version-document-path'

export async function readLegacyMilestoneRecovery(
  directory: string,
  key: string
): Promise<MilestoneRecoveryRecord> {
  const file = join(directory, `${createHash('sha256').update(key).digest('hex')}.json`)
  try {
    const info = await lstat(file)
    if (!info.isFile() || info.size > 20 * 1024 * 1024) {
      throw new Error('旧版里程碑草稿无法读取，原文件仍保留。')
    }
    return MilestoneRecoveryRecordSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    if (isMissingFile(error)) {
      return { revision: null, payload: null }
    }
    throw error
  }
}
