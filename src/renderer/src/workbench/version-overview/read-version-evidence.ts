import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { VersionCatalogState } from '../use-version-catalog'
import { nativeVersionHistoryPort } from '../version-history-port'
import { nativeArchivePrPort } from '../archive-pr-port'
import { validTime, PARSER_REVISION } from './feature-model'
import type { OverviewVersionPlan, VersionEvidence } from './version-evidence'
import { mapLimit } from './read-feature-evidence'

export type VersionEvidenceProblem = { version: string; message: string }

/** Archive merge metadata and the acceptance's pinned plan are independent evidence. */
export async function readVersionEvidence(
  catalog: VersionCatalogState,
  force = false,
  workingPlan?: { document: PlanningMaterial; source: 'committed' | 'draft' }
): Promise<{
  records: VersionEvidence[]
  plans: OverviewVersionPlan[]
  problems: VersionEvidenceProblem[]
}> {
  const records: VersionEvidence[] = [],
    plans: OverviewVersionPlan[] = [],
    problems: VersionEvidenceProblem[] = []
  if (!catalog.scope || !catalog.home) {
    throw new Error('版本工作区未就绪')
  }
  const scope = {
    repoId: catalog.scope.repoId,
    worktreeId: catalog.home.id,
    hostId: catalog.scope.hostId
  }
  const history = nativeVersionHistoryPort(catalog.scope.runtimeOwnerEnvironmentId)
  const archive = nativeArchivePrPort(catalog.scope.runtimeOwnerEnvironmentId)
  const reads = new Map<string, Promise<ArchivePrStatusResult>>()
  async function readArchive(document: PlanningMaterial | AcceptanceMaterial) {
    const pr = document.workflow?.archivePr
    if (!pr) {
      return null
    }
    const key = JSON.stringify(pr)
    if (!reads.has(key)) {
      reads.set(
        key,
        archive.readStatus(scope, pr, force).catch((error): ArchivePrStatusResult => ({
          state: 'unknown',
          reason: error instanceof Error ? error.message : String(error)
        }))
      )
    }
    const status = await reads.get(key)!
    if (status.state === 'unknown') {
      problems.push({
        version: document.version,
        message: `${document.version} 归档 PR #${pr.number}：${status.reason}`
      })
    }
    return status
  }
  function archiveEvent(
    document: PlanningMaterial | AcceptanceMaterial,
    status: ArchivePrStatusResult | null,
    kind: 'plan' | 'acceptance'
  ) {
    const pr = document.workflow?.archivePr
    if (!pr || !status) {
      return undefined
    }
    return {
      id: `${kind}:${document.version}:${pr.number}`,
      phase: kind === 'plan' ? ('intent' as const) : ('version' as const),
      label: `${document.version} ${kind === 'plan' ? '计划' : '验收'} PR #${pr.number} · ${status.state === 'merged' ? '已合入' : status.state === 'unknown' ? '状态未知' : '未合入'}`,
      at: status.state === 'merged' && validTime(status.mergedAt) ? status.mergedAt : '',
      url: status.url ?? '',
      readAt: status.state === 'unknown' ? new Date().toISOString() : status.checkedAt,
      rule: PARSER_REVISION,
      version: document.version
    }
  }
  async function addPlan(
    document: PlanningMaterial,
    source: 'committed' | 'draft' = 'committed',
    taskSnapshot?: AcceptanceMaterial['taskSnapshot']
  ) {
    const status = await readArchive(document)
    const confirmation =
      status?.state === 'merged' && validTime(status.mergedAt)
        ? {
            id: `plan:${document.version}:${document.workflow!.archivePr!.number}`,
            phase: 'intent' as const,
            label: `${document.version} 计划 PR 合入确认意图`,
            at: status.mergedAt,
            url: status.url ?? '',
            readAt: status.checkedAt,
            rule: PARSER_REVISION,
            version: document.version
          }
        : undefined
    plans.push({
      version: document.version,
      tasks: document.tasks,
      goals: document.goals,
      source,
      taskSnapshot,
      confirmation,
      archive: archiveEvent(document, status, 'plan')
    })
  }
  const entries = catalog.catalog?.entries ?? []
  await mapLimit(
    entries,
    async (entry) => {
      try {
        const ref = entry.material.acceptance
        if (!ref) {
          if (workingPlan?.document.version === entry.version) {
            await addPlan(workingPlan.document, workingPlan.source)
          } else if (entry.material.plan) {
            const fixed = await history.readPlan({
              scope,
              planRef: {
                kind: 'committed',
                version: entry.version,
                cycleId: entry.material.plan.cycleId,
                sourceCommit: entry.material.plan.sourceCommit,
                revision: entry.material.plan.revision
              }
            })
            await addPlan(fixed.document)
          } else if (entry.draft) {
            plans.push({
              version: entry.version,
              tasks: entry.tasks,
              goals: entry.goals.map((g) => ({ ...g, metricTargets: [] })),
              source: 'draft'
            })
          }
          return
        }
        const read = await history.read({
          scope,
          source: 'trunk',
          sourceCommit: ref.sourceCommit,
          version: entry.version,
          cycleId: ref.cycleId,
          workflow: 'acceptance'
        })
        const acceptance = read.document as AcceptanceMaterial
        const plan = await history.readPlan({ scope, planRef: acceptance.planRef })
        await addPlan(plan.document, 'committed', acceptance.taskSnapshot)
        const status = await readArchive(acceptance)
        records.push({
          version: entry.version,
          plan: plan.document,
          acceptance,
          at:
            status?.state === 'merged' && validTime(status.mergedAt) ? status.mergedAt : undefined,
          archiveUrl: status && 'url' in status ? status.url : undefined,
          archive: archiveEvent(acceptance, status, 'acceptance'),
          revision: ref.sourceCommit,
          readAt: new Date().toISOString()
        })
      } catch (error) {
        problems.push({
          version: entry.version,
          message: `${entry.version} 验收依据：${error instanceof Error ? error.message : String(error)}`
        })
      }
    },
    2
  )
  const order = new Map(entries.map((entry, index) => [entry.version, index]))
  plans.sort((a, b) => (order.get(a.version) ?? Infinity) - (order.get(b.version) ?? Infinity))
  records.sort((a, b) => (order.get(a.version) ?? Infinity) - (order.get(b.version) ?? Infinity))
  if (workingPlan && !plans.some((entry) => entry.version === workingPlan.document.version)) {
    await addPlan(workingPlan.document, workingPlan.source)
  }
  return { records, plans, problems }
}
