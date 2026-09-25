import { createHash } from 'node:crypto'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema
} from '../../shared/workbench/version-material'

export class HistorySourceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'HistorySourceError'
  }
}

export function decodeHistorySnapshot(
  raw: Buffer,
  version: string,
  workflow: 'plan' | 'acceptance'
) {
  try {
    const value: unknown = JSON.parse(raw.toString('utf8'))
    if (
      value &&
      typeof value === 'object' &&
      'schema_version' in value &&
      value.schema_version === 2
    ) {
      throw new HistorySourceError(
        'migration-required',
        '此记录使用旧版材料格式，需明确迁移后才能按本版口径读取'
      )
    }
    const document =
      workflow === 'plan'
        ? PlanningMaterialSchema.parse(value)
        : AcceptanceMaterialSchema.parse(value)
    if (document.version !== version) {
      throw new Error('Material version differs from its path')
    }
    return { document, revision: `sha256:${createHash('sha256').update(raw).digest('hex')}` }
  } catch (error) {
    if (error instanceof HistorySourceError) {
      throw error
    }
    throw new HistorySourceError(
      'invalid-history',
      `历史材料 ${version} 无法核对：${error instanceof Error ? error.message : String(error)}`
    )
  }
}
