import { randomUUID } from 'node:crypto'
import type { Worktree } from '../../shared/worktree/types'
import { collectVersionCatalogWorkspaces } from '../../shared/workbench/version-catalog'
import { selectPriorVersionSource } from '../../shared/workbench/prior-version-source'
import type { VersionHistoryPort } from '../../shared/workbench/version-history'
import type { PlanningProgressSource } from '../../shared/workbench/version-material'
import type { VersionMaterialScope } from '../../shared/workbench/version-material-request'
import type {
  VersionWorkspacePrepareResult,
  VersionWorkspacePrepareStep
} from '../../shared/workbench/version-workspace-prepare'
import type { createVersionMaterialService } from './version-material-service'

/** Create only: existing plans survive unchanged; unavailable prior review does not block creation. */
export async function initializeVersionWorkspacePlan({
  scope,
  version,
  branch,
  materialService,
  history,
  listRegistered,
  problems
}: {
  scope: VersionMaterialScope
  version: string
  branch: string
  materialService: Pick<
    ReturnType<typeof createVersionMaterialService>,
    'read' | 'initializeEmptyPlan'
  >
  history?: Pick<VersionHistoryPort, 'list'>
  listRegistered: () => Promise<Worktree[]>
  problems: VersionWorkspacePrepareResult['problems']
}): Promise<NonNullable<VersionWorkspacePrepareStep['material']>> {
  if (history) {
    const existing = await materialService.read({ ...scope, version })
    if (existing) {
      return { state: 'existing', revision: existing.revision }
    }
  }
  let progressSource: PlanningProgressSource | undefined
  if (history) {
    try {
      const catalog = await history.list({
        scope: { repoId: scope.repoId, worktreeId: scope.worktreeId, hostId: scope.hostId },
        currentOnly: true
      })
      const knownVersions = collectVersionCatalogWorkspaces(await listRegistered(), [
        scope.repoId
      ]).map((tree) => tree.binding.version)
      const prior = selectPriorVersionSource(version, catalog, knownVersions)
      if (prior.kind === 'source') {
        progressSource = prior.source
      }
    } catch (error) {
      problems.push({
        workflow: 'plan',
        code: 'prior-source-unavailable',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
  const outcome = await materialService.initializeEmptyPlan(scope, {
    version,
    cycleId: randomUUID(),
    expectedBranch: branch,
    ...(progressSource ? { progressSource } : {})
  })
  return outcome.created
    ? { state: 'initialized', revision: outcome.revision }
    : { state: 'existing', revision: outcome.revision }
}
