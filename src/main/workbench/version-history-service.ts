import { readCurrentVersionCatalog, withVersionTreeAlignment } from './version-current-catalog'
import type { MetricScope } from '../../shared/workbench/metrics'
import {
  PlanningMaterialSchema,
  SourceCommit,
  MaterialVersion
} from '../../shared/workbench/version-material'
import {
  VersionHistoryListSchema,
  VersionHistoryReadSchema,
  VersionHistoryReadPlanSchema,
  VersionTreePlansSchema,
  type VersionHistoryPort,
  type VersionHistorySource,
  type VersionHistoryProblem,
  type VersionTreePlan
} from '../../shared/workbench/version-history'
import type { VersionDocumentSnapshot } from '../../shared/workbench/version-document'
import type { PlanningMaterial } from '../../shared/workbench/version-material'
import {
  acceptanceRoundMetadata,
  decodeHistorySnapshot,
  planningMaterialGitPath,
  HistorySourceError
} from './version-history-snapshot'
export { HistorySourceError } from './version-history-snapshot'

/** Each dependency authorizes native repository/host/worktree IDs; callers never supply paths. */
export type VersionHistoryHost = {
  git(scope: MetricScope, args: string[]): Promise<Buffer>
  baseline(scope: MetricScope): Promise<{ ref: string; commit: string }>
  /** The cycle worktree's own HEAD — the branch its board session works in. */
  worktreeHead(scope: MetricScope): Promise<string>
  /** Folder names under `.bw/planning` at a commit; a missing folder lists empty, not an error. */
  listPlanningDirs(scope: MetricScope, commit: string): Promise<string[]>
  readDraft(
    scope: MetricScope,
    version: string
  ): Promise<VersionDocumentSnapshot<PlanningMaterial> | null>
}

export function createVersionHistoryService(host: VersionHistoryHost): VersionHistoryPort {
  async function verifySource(scope: MetricScope, sourceCommit: string, includeCycle = false) {
    const baseline = await host.baseline(scope)
    SourceCommit.parse(baseline.commit)
    const tips = includeCycle
      ? [SourceCommit.parse(await host.worktreeHead(scope)), baseline.commit]
      : [baseline.commit]
    for (const tip of tips) {
      try {
        await host.git(scope, ['merge-base', '--is-ancestor', sourceCommit, tip])
        return baseline
      } catch {
        // not on this tip; the other one may still carry it
      }
    }
    throw new HistorySourceError(
      'unverified-source',
      includeCycle
        ? '材料提交不在本分支或主干基线历史上；没有改读最新材料'
        : '无法证明材料提交已合入项目主干基线；没有改读最新材料'
    )
  }

  async function readSnapshot(
    scope: MetricScope,
    sourceCommit: string,
    version: string,
    workflow: 'plan' | 'acceptance'
  ) {
    MaterialVersion.parse(version)
    const path = planningMaterialGitPath(version, workflow)
    let raw: Buffer
    try {
      raw = await host.git(scope, ['show', `${sourceCommit}:${path}`])
    } catch {
      throw new HistorySourceError('history-unavailable', `无法读取固定提交中的 ${path}`)
    }
    return decodeHistorySnapshot(raw, version, workflow)
  }

  async function listTreePlans(scope: MetricScope): Promise<{
    head: string
    plans: VersionTreePlan[]
    problems: { version: string; code: string; message: string }[]
  }> {
    const head = await host.worktreeHead(scope)
    SourceCommit.parse(head)
    const names = await host.listPlanningDirs(scope, head)
    const plans: VersionTreePlan[] = []
    const problems: { version: string; code: string; message: string }[] = []
    for (const name of names) {
      if (!MaterialVersion.safeParse(name).success) {
        problems.push({
          version: name,
          code: 'invalid-version',
          message: `版本目录 ${name} 不符合材料约定，未作为有效版本读取`
        })
        continue
      }
      try {
        const snapshot = await readSnapshot(scope, head, name, 'plan')
        plans.push({
          version: snapshot.document.version,
          cycleId: snapshot.document.cycleId,
          sourceCommit: head,
          revision: snapshot.revision,
          workflow: 'plan'
        })
      } catch (error) {
        problems.push({
          version: name,
          code: error instanceof HistorySourceError ? error.code : 'history-unavailable',
          message: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return { head, plans, problems }
  }

  return {
    async list(input) {
      const {
        scope,
        source = 'trunk',
        version,
        workflow: requestedWorkflow,
        currentOnly = false,
        allRevisions = false
      } = VersionHistoryListSchema.parse(input)
      const baseline =
        source === 'cycle'
          ? { ref: 'HEAD', commit: await host.worktreeHead(scope) }
          : await host.baseline(scope)
      SourceCommit.parse(baseline.commit)
      const matches = (entry: { version: string; workflow: 'plan' | 'acceptance' }) =>
        (version === undefined || entry.version === version) &&
        (requestedWorkflow === undefined || entry.workflow === requestedWorkflow)
      if (currentOnly) {
        const catalog = await readCurrentVersionCatalog(scope, baseline, host.git, readSnapshot)
        return {
          ...catalog,
          records: catalog.records.filter(matches),
          problems: catalog.problems.filter(matches)
        }
      }
      const log = await host.git(scope, [
        'log',
        '-z',
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
      const tokens = log.toString('utf8').split('\0')
      for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index]
        if (SourceCommit.safeParse(token).success) {
          sourceCommit = token
          committedAt = tokens[++index]
          continue
        }
        // Git separates the commit header from its first raw path with one newline.
        const line = token.replace(/^\n/, '')
        const path = /^\.bw\/planning\/([^/]+)\/(data|acceptance)\.json$/.exec(line)
        if (!path || !sourceCommit) {
          continue
        }
        const workflow = path[2] === 'data' ? 'plan' : 'acceptance'
        if (!matches({ version: path[1], workflow })) {
          continue
        }
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
        // The default catalog collapses one cycle's intermediate saves. A week
        // history explicitly keeps each commit, because cycleId spans weeks.
        // Every record is reachable from the selected, pinned source tip.
        const key = JSON.stringify([
          path[1],
          workflow,
          allRevisions ? sourceCommit : snapshot.document.cycleId
        ])
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
          committedAt,
          ...acceptanceRoundMetadata(snapshot.document)
        })
      }
      return { records, problems }
    },
    async listTreePlans(input) {
      const { scope, adoptedCommit } = VersionTreePlansSchema.parse(input)
      return withVersionTreeAlignment(scope, adoptedCommit, await listTreePlans(scope), host.git)
    },
    async read(input) {
      const request = VersionHistoryReadSchema.parse(input)
      await verifySource(request.scope, request.sourceCommit, request.source === 'cycle')
      const snapshot = await readSnapshot(
        request.scope,
        request.sourceCommit,
        request.version,
        request.workflow
      )
      if (snapshot.document.cycleId !== request.cycleId) {
        throw new HistorySourceError('history-identity-mismatch', '固定提交中的周期与所选记录不同')
      }
      if (request.expectedRevision && snapshot.revision !== request.expectedRevision) {
        throw new HistorySourceError(
          'history-identity-mismatch',
          '固定提交中的材料修订与所选记录不同'
        )
      }
      return { ...snapshot, sourceCommit: request.sourceCommit }
    },
    async readPlan(input) {
      const { scope, planRef } = VersionHistoryReadPlanSchema.parse(input)
      const baseline =
        planRef.kind === 'committed' ? await verifySource(scope, planRef.sourceCommit, true) : null
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
