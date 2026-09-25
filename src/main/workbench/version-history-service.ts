import type { MetricScope } from '../../shared/workbench/metrics'
import {
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
import {
  ArchiveMergeProofSchema,
  type ArchiveMergeProof
} from '../../shared/workbench/version-archive'
import { decodeHistorySnapshot, HistorySourceError } from './version-history-snapshot'
export { HistorySourceError } from './version-history-snapshot'

/** Each dependency authorizes native repository/host/worktree IDs; callers never supply paths. */
export type VersionHistoryHost = {
  git(scope: MetricScope, args: string[]): Promise<Buffer>
  baseline(scope: MetricScope): Promise<{ ref: string; commit: string }>
  readDraft(
    scope: MetricScope,
    version: string
  ): Promise<VersionDocumentSnapshot<PlanningMaterial> | null>
  /** Native archive/provider evidence, never inferred only from Git reachability or topology. */
  archiveState(
    scope: MetricScope,
    candidate: {
      baseline: { ref: string; commit: string }
      sourceCommit: string
      version: string
      cycleId: string
      workflow: 'plan' | 'acceptance'
      revision: string
    }
  ): Promise<
    | { kind: 'adopted'; proof: ArchiveMergeProof }
    | { kind: 'draft' }
    | { kind: 'unknown'; message: string }
  >
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

  async function archiveState(
    scope: MetricScope,
    candidate: Parameters<VersionHistoryHost['archiveState']>[1]
  ) {
    try {
      const state = await host.archiveState(scope, candidate)
      if (state.kind === 'adopted') {
        const parsed = ArchiveMergeProofSchema.safeParse(state.proof)
        if (
          !parsed.success ||
          parsed.data.mergeCommit !== candidate.sourceCommit ||
          parsed.data.material.workflow !== candidate.workflow ||
          parsed.data.material.version !== candidate.version ||
          parsed.data.material.cycleId !== candidate.cycleId ||
          parsed.data.material.revision !== candidate.revision
        ) {
          return { kind: 'unknown' as const, message: '归档依据与所选提交或材料修订不一致' }
        }
      }
      return state
    } catch (error) {
      return {
        kind: 'unknown' as const,
        message: error instanceof Error ? error.message : '归档来源暂不可核对'
      }
    }
  }

  async function requireArchive(
    scope: MetricScope,
    candidate: Parameters<VersionHistoryHost['archiveState']>[1]
  ) {
    const state = await archiveState(scope, candidate)
    if (state.kind !== 'adopted') {
      throw new HistorySourceError(
        'archive-unverified',
        state.kind === 'unknown' ? state.message : '所选材料是工作中草稿，尚未成为归档记录'
      )
    }
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
    return decodeHistorySnapshot(raw, version, workflow)
  }

  return {
    async list(input) {
      const { scope } = VersionHistoryListSchema.parse(input)
      const baseline = await host.baseline(scope)
      SourceCommit.parse(baseline.commit)
      const log = await host.git(scope, [
        '-c',
        'core.quotepath=false',
        'log',
        '--full-history',
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
        if (!path || !sourceCommit) {
          continue
        }
        const workflow = path[2] === 'data' ? 'plan' : 'acceptance'
        if (!MaterialVersion.safeParse(path[1]).success) {
          problems.push({
            version: path[1],
            sourceCommit,
            workflow,
            committedAt,
            code: 'invalid-version',
            message: `历史路径 ${line} 的版本目录不符合材料约定，未作为有效版本读取`
          })
          continue
        }
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
        const adopted = await archiveState(scope, {
          baseline,
          sourceCommit,
          version: path[1],
          workflow,
          revision: snapshot.revision,
          cycleId: snapshot.document.cycleId
        })
        if (adopted.kind === 'draft') {
          continue
        }
        if (adopted.kind === 'unknown') {
          problems.push({
            version: path[1],
            sourceCommit,
            workflow,
            committedAt,
            code: 'archive-unverified',
            message: adopted.message
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
      const baseline = await verifySource(request.scope, request.sourceCommit)
      const snapshot = await readSnapshot(
        request.scope,
        request.sourceCommit,
        request.version,
        request.workflow
      )
      if (snapshot.document.cycleId !== request.cycleId) {
        throw new HistorySourceError('history-identity-mismatch', '固定提交中的周期与所选记录不同')
      }
      await requireArchive(request.scope, {
        baseline,
        sourceCommit: request.sourceCommit,
        version: request.version,
        cycleId: request.cycleId,
        workflow: request.workflow,
        revision: snapshot.revision
      })
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
      if (planRef.kind === 'committed' && baseline) {
        await requireArchive(scope, {
          baseline,
          sourceCommit: planRef.sourceCommit,
          version: planRef.version,
          cycleId: planRef.cycleId,
          workflow: 'plan',
          revision: snapshot.revision
        })
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
