import { createHash } from 'node:crypto'
import type { MetricScope } from '../../shared/workbench/metrics'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  SourceCommit,
  MaterialVersion,
  type PlanningMaterial
} from '../../shared/workbench/version-material'
import {
  VersionHistoryListSchema,
  VersionHistoryReadSchema,
  VersionHistoryReadPlanSchema,
  type VersionHistoryPort,
  type VersionHistorySource,
  type VersionHistoryProblem
} from '../../shared/workbench/version-history'
import type { VersionDocumentSnapshot } from '../../shared/workbench/version-document'

export class HistorySourceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'HistorySourceError'
  }
}

/** Each dependency authorizes native repository/host/worktree IDs; callers never supply paths. */
export type VersionHistoryHost = {
  git(scope: MetricScope, args: string[]): Promise<Buffer>
  baseline(scope: MetricScope): Promise<{ ref: string; commit: string }>
  readDraft(
    scope: MetricScope,
    version: string
  ): Promise<VersionDocumentSnapshot<PlanningMaterial> | null>
}

function decodeSnapshot(raw: Buffer, version: string, workflow: 'plan' | 'acceptance') {
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

export function createVersionHistoryService(host: VersionHistoryHost): VersionHistoryPort {
  async function verifySource(scope: MetricScope, sourceCommit: string) {
    const baseline = await host.baseline(scope)
    SourceCommit.parse(baseline.commit)
    try {
      await host.git(scope, ['merge-base', '--is-ancestor', sourceCommit, baseline.commit])
    } catch {
      throw new HistorySourceError(
        'unverified-source',
        '无法证明材料提交已合入项目采用分支；没有改读最新材料'
      )
    }
    return baseline
  }

  async function readSnapshot(
    scope: MetricScope,
    sourceCommit: string,
    version: string,
    workflow: 'plan' | 'acceptance'
  ) {
    MaterialVersion.parse(version)
    const path = `.bw/planning/${version}/${workflow === 'plan' ? 'data' : 'acceptance'}.json`
    let raw: Buffer
    try {
      raw = await host.git(scope, ['show', `${sourceCommit}:${path}`])
    } catch {
      throw new HistorySourceError('history-unavailable', `无法读取固定提交中的 ${path}`)
    }
    return decodeSnapshot(raw, version, workflow)
  }

  return {
    async list(input) {
      const { scope } = VersionHistoryListSchema.parse(input)
      const baseline = await host.baseline(scope)
      SourceCommit.parse(baseline.commit)
      // Record snapshots adopted on the baseline, not every earlier draft from a merged branch.
      const log = await host.git(scope, [
        '-c',
        'core.quotepath=false',
        'log',
        '--first-parent',
        '--diff-merges=first-parent',
        '--format=%H%x00%cI',
        '--name-only',
        '--diff-filter=AM',
        '--no-renames',
        baseline.commit,
        '--',
        '.bw/planning'
      ])
      let sourceCommit = ''
      let committedAt = ''
      const seen = new Set<string>()
      const records: VersionHistorySource[] = []
      const problems: VersionHistoryProblem[] = []
      for (const line of log.toString('utf8').split(/\r?\n/)) {
        const header = /^([a-f0-9]{40}|[a-f0-9]{64})\0(.+)$/.exec(line)
        if (header) {
          sourceCommit = header[1]
          committedAt = header[2]
          continue
        }
        const path = /^\.bw\/planning\/([^/]+)\/(data|acceptance)\.json$/.exec(line)
        if (!path || !sourceCommit || !MaterialVersion.safeParse(path[1]).success) {
          continue
        }
        const workflow = path[2] === 'data' ? 'plan' : 'acceptance'
        let snapshot: Awaited<ReturnType<typeof readSnapshot>>
        try {
          snapshot = await readSnapshot(scope, sourceCommit, path[1], workflow)
        } catch (error) {
          if (!(error instanceof HistorySourceError)) {
            throw error
          }
          problems.push({
            version: path[1],
            sourceCommit,
            workflow,
            committedAt,
            code: error.code,
            message: error.message
          })
          continue
        }
        const key = JSON.stringify([path[1], workflow, snapshot.revision])
        if (seen.has(key)) {
          continue
        }
        seen.add(key)
        records.push({
          version: snapshot.document.version,
          cycleId: snapshot.document.cycleId,
          sourceCommit,
          revision: snapshot.revision,
          workflow,
          committedAt
        })
      }
      return { records, problems }
    },
    async read(input) {
      const request = VersionHistoryReadSchema.parse(input)
      await verifySource(request.scope, request.sourceCommit)
      const snapshot = await readSnapshot(
        request.scope,
        request.sourceCommit,
        request.version,
        request.workflow
      )
      if (snapshot.document.cycleId !== request.cycleId) {
        throw new HistorySourceError('history-identity-mismatch', '固定提交中的周期与所选记录不同')
      }
      return { ...snapshot, sourceCommit: request.sourceCommit }
    },
    async readPlan(input) {
      const { scope, planRef } = VersionHistoryReadPlanSchema.parse(input)
      const baseline =
        planRef.kind === 'committed' ? await verifySource(scope, planRef.sourceCommit) : null
      const snapshot =
        planRef.kind === 'committed'
          ? await readSnapshot(scope, planRef.sourceCommit, planRef.version, 'plan')
          : await host.readDraft(
              { ...scope, worktreeId: planRef.sourceWorktreeId, hostId: planRef.sourceHostId },
              planRef.version
            )
      if (!snapshot) {
        throw new HistorySourceError('history-unavailable', '引用的计划草案不存在')
      }
      if (
        snapshot.revision !== planRef.revision ||
        snapshot.document.cycleId !== planRef.cycleId ||
        snapshot.document.version !== planRef.version
      ) {
        throw new HistorySourceError(
          'history-identity-mismatch',
          '计划引用的内容、版本或周期已变化，请核对原承诺'
        )
      }
      return {
        document: PlanningMaterialSchema.parse(snapshot.document),
        revision: snapshot.revision,
        planRef,
        source:
          planRef.kind === 'committed'
            ? {
                kind: 'committed',
                sourceCommit: planRef.sourceCommit,
                baselineCommit: baseline!.commit,
                baselineRef: baseline!.ref
              }
            : {
                kind: 'draft',
                sourceHostId: planRef.sourceHostId,
                sourceWorktreeId: planRef.sourceWorktreeId
              }
      }
    }
  }
}
