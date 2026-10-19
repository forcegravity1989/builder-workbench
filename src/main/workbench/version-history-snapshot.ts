import { createHash } from 'node:crypto'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type PlanningMaterial
} from '../../shared/workbench/version-material'
import type { VersionHistorySource } from '../../shared/workbench/version-history'
import { acceptanceRoundState } from '../../shared/workbench/acceptance-rounds'

/** Round labels describe the selected Git bytes; ambiguous or absent metadata stays unknown. */
export function acceptanceRoundMetadata(
  document: PlanningMaterial | AcceptanceMaterial
): Pick<VersionHistorySource, 'roundId' | 'week' | 'roundKind'> {
  if (!('results' in document)) {
    return {}
  }
  const state = acceptanceRoundState(document)
  if (state.kind === 'conflict') {
    return {}
  }
  if (state.current) {
    return { roundId: state.current.id, week: state.current.week, roundKind: state.current.kind }
  }
  const latestClosedAt = state.rounds.reduce(
    (latest, round) => Math.max(latest, round.closedAt ? Date.parse(round.closedAt) : 0),
    0
  )
  const candidates = state.rounds.filter(
    (round) => round.closedAt && Date.parse(round.closedAt) === latestClosedAt
  )
  if (candidates.length !== 1) {
    return {}
  }
  const round = candidates[0]
  return { roundId: round.id, week: round.week, roundKind: round.kind }
}

export class HistorySourceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'HistorySourceError'
  }
}

/** The one Git path a workflow's material lives at, shared by scans, reads and proof checks. */
export function planningMaterialGitPath(version: string, workflow: 'plan' | 'acceptance'): string {
  return `.bw/planning/${version}/${workflow === 'plan' ? 'data' : 'acceptance'}.json`
}

/** Fixed Git references retain their original byte identity. */
export function historySnapshotRevision(raw: Buffer): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`
}

/** Material revision ignores Git checkout CRLF conversion; all other content remains significant. */
export function materialContentRevision(raw: Buffer): string {
  return `sha256:${createHash('sha256').update(raw.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')}`
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
    return { document, revision: historySnapshotRevision(raw) }
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
