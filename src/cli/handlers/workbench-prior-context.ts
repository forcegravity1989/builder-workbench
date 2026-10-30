import type { HandlerContext } from '../dispatch'
import type { RuntimeWorktreeListResult } from '../../shared/runtime-types'
import { RuntimeClientError } from '../runtime/types'
import { collectVersionCatalogWorkspaces } from '../../shared/workbench/version-catalog'
import { selectPriorVersionSource } from '../../shared/workbench/prior-version-source'
import { readPlanningProgressSource } from '../../shared/workbench/planning-progress-source'
import type {
  VersionHistoryCatalog,
  VersionHistoryPort
} from '../../shared/workbench/version-history'
import {
  PlanningMaterialSchema,
  type PlanningProgressSource
} from '../../shared/workbench/version-material'
import type {
  VersionMaterialResult,
  VersionMaterialScope
} from '../../shared/workbench/version-material-request'

type PriorReviewContext =
  | { kind: 'unselected' | 'none' }
  | { kind: 'missing'; version: string }
  | { kind: 'ready'; source: PlanningProgressSource }
  | { kind: 'error'; reason: string }

/** The same adjacent-version and fixed-source checks as the planning board. */
export async function readWorkbenchPriorContext(
  ctx: HandlerContext,
  scope: VersionMaterialScope,
  version: string | null,
  knownVersions: string[],
  projectId?: string
): Promise<PriorReviewContext> {
  if (!version) {
    return { kind: 'unselected' }
  }
  const historyScope = { repoId: scope.repoId, worktreeId: scope.worktreeId, hostId: scope.hostId }
  async function read<T>(method: string, params: unknown): Promise<T> {
    const response = await ctx.client.call<VersionMaterialResult<T>>(method, params)
    if (!response.result.ok) {
      throw new RuntimeClientError(response.result.error.code, response.result.error.message)
    }
    return response.result.value
  }
  try {
    const current = await read<{ document: unknown } | null>('workbench.materials.read', {
      ...scope,
      version
    })
    let source = current
      ? PlanningMaterialSchema.parse(current.document).summary.progressSource
      : undefined
    if (!source) {
      const catalog = await read<VersionHistoryCatalog>('workbench.history.list', {
        scope: historyScope,
        currentOnly: true
      })
      const trees = await ctx.client.call<RuntimeWorktreeListResult>('worktree.list', {
        limit: 10_000
      })
      if (trees.result.truncated) {
        throw new Error('版本工作树目录未完整返回，未猜测上版来源。')
      }
      const boundVersions = collectVersionCatalogWorkspaces(
        trees.result.worktrees.filter(
          (tree) =>
            (tree.hostId ?? tree.identity?.executionHostId ?? 'local') === scope.hostId &&
            !tree.runtimeOwnerEnvironmentId
        ),
        [scope.repoId],
        projectId
      ).map((tree) => tree.binding.version)
      const prior = selectPriorVersionSource(version, catalog, [...knownVersions, ...boundVersions])
      if (prior.kind !== 'source') {
        return prior
      }
      source = prior.source
    }
    const history: Pick<VersionHistoryPort, 'read' | 'readPlan'> = {
      read: (input) => read('workbench.history.read', input),
      readPlan: (input) => read('workbench.history.readPlan', input)
    }
    await readPlanningProgressSource(history, historyScope, source)
    return { kind: 'ready', source }
  } catch (error) {
    return { kind: 'error', reason: error instanceof Error ? error.message : String(error) }
  }
}
