import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { VersionCatalogState } from '../use-version-catalog'
import { nativeVersionHistoryPort } from '../version-history-port'
import type { OverviewVersionPlan, VersionEvidence } from './version-evidence'
import { humanAcceptanceTime } from './version-evidence'

/** Read the plan pinned by each acceptance; catalog goal rows can have a newer revision. */
export async function readVersionEvidence(
  catalog: VersionCatalogState,
  versions?: Set<string>
): Promise<{ records: VersionEvidence[]; plans: OverviewVersionPlan[]; problems: string[] }> {
  const records: VersionEvidence[] = [],
    plans: OverviewVersionPlan[] = [],
    problems: string[] = []
  if (!catalog.scope || !catalog.home) {
    return { records, plans, problems: ['版本工作区未就绪'] }
  }
  const scope = {
    repoId: catalog.scope.repoId,
    worktreeId: catalog.home.id,
    hostId: catalog.scope.hostId
  }
  const history = nativeVersionHistoryPort(catalog.scope.runtimeOwnerEnvironmentId)
  for (const entry of catalog.catalog?.entries ?? []) {
    const ref = entry.material.acceptance
    if (versions && !versions.has(entry.version)) {
      continue
    }
    try {
      if (!ref) {
        if (entry.material.plan) {
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
          plans.push({
            version: entry.version,
            tasks: fixed.document.tasks,
            goals: fixed.document.goals,
            source: 'committed'
          })
        } else if (entry.draft) {
          plans.push({
            version: entry.version,
            tasks: entry.tasks,
            goals: entry.goals.map((g) => ({ ...g, metricTargets: [] })),
            source: 'draft'
          })
        }
        continue
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
      plans.push({
        version: entry.version,
        tasks: plan.document.tasks,
        goals: plan.document.goals,
        source: 'committed'
      })
      records.push({
        version: entry.version,
        plan: plan.document,
        acceptance,
        at: humanAcceptanceTime(
          acceptance,
          plan.document.goals.map((goal) => goal.goalId)
        ),
        revision: ref.sourceCommit,
        readAt: new Date().toISOString()
      })
    } catch (e) {
      problems.push(`${entry.version} 验收依据：${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { records, plans, problems }
}
