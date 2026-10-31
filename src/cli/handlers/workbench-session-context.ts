import type { HandlerContext } from '../dispatch'
import type { RuntimeWorktreeRecord, RuntimeWorktreeListResult } from '../../shared/runtime-types'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { resolveCurrentWorktreeSelector } from '../selectors'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { parseExecutionHostId } from '../../shared/execution-host'
import { normalizeStoredWorkbenchVersionBinding } from '../../shared/workbench/version-binding'
import {
  VersionMaterialScopeSchema,
  type VersionMaterialCandidate,
  type VersionMaterialResult,
  type VersionMaterialScope
} from '../../shared/workbench/version-material-request'
import type {
  VersionTreePlanCatalog,
  VersionHistoryCatalog,
  VersionHistoryPort
} from '../../shared/workbench/version-history'
import { collectVersionCatalogWorkspaces } from '../../shared/workbench/version-catalog'
import { selectPriorVersionSource } from '../../shared/workbench/prior-version-source'
import { readPlanningProgressSource } from '../../shared/workbench/planning-progress-source'
import {
  PlanningMaterialSchema,
  type PlanningProgressSource
} from '../../shared/workbench/version-material'

/** Resolve identity from the caller's native workspace, never the UI's focused tab. */
export async function readWorkbenchSessionContext(ctx: HandlerContext): Promise<void> {
  const repoId = getOptionalStringFlag(ctx.flags, 'repo-id')
  const worktreeId = getOptionalStringFlag(ctx.flags, 'worktree-id')
  const requestedHost = getOptionalStringFlag(ctx.flags, 'host-id')
  if (Boolean(repoId) !== Boolean(worktreeId)) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use --repo-id and --worktree-id together, or omit both inside the workflow workspace.'
    )
  }
  const inheritedId = process.env.ORCA_WORKTREE_ID?.trim()
  const selector = worktreeId || inheritedId
  let worktree: RuntimeWorktreeRecord
  if (requestedHost && selector) {
    const listed = await ctx.client.call<RuntimeWorktreeListResult>('worktree.list', {
      limit: 10_000
    })
    const matches = listed.result.worktrees.filter(
      (tree) =>
        tree.id === selector &&
        (!repoId || tree.repoId === repoId) &&
        (tree.hostId ?? tree.identity?.executionHostId ?? 'local') === requestedHost
    )
    if (listed.result.truncated || matches.length !== 1) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Workflow workspace owner is missing or ambiguous. Read its owning runtime again.'
      )
    }
    worktree = matches[0]
  } else {
    const shown = await ctx.client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
      worktree: selector
        ? `id:${selector}`
        : await resolveCurrentWorktreeSelector(ctx.cwd, ctx.client)
    })
    worktree = shown.result.worktree
  }
  const host = parseExecutionHostId(
    worktree.hostId ?? worktree.identity?.executionHostId ?? 'local'
  )
  if (
    !host ||
    host.kind === 'runtime' ||
    worktree.runtimeOwnerEnvironmentId ||
    (repoId && repoId !== worktree.repoId) ||
    (worktreeId && worktreeId !== worktree.id) ||
    (requestedHost && requestedHost !== host.id)
  ) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Workflow workspace owner is missing or conflicts with the requested scope. Use its owning Orca runtime.'
    )
  }
  const scope = VersionMaterialScopeSchema.parse({
    repoId: worktree.repoId,
    worktreeId: worktree.id,
    hostId: host.id,
    workflow: getRequiredStringFlag(ctx.flags, 'workflow')
  })
  const selected = await ctx.client.call<VersionMaterialResult<{ version: string | null }>>(
    'workbench.materials.context',
    scope
  )
  if (!selected.result.ok) {
    throw new RuntimeClientError(selected.result.error.code, selected.result.error.message)
  }
  const listed = await ctx.client.call<VersionMaterialResult<VersionMaterialCandidate[]>>(
    'workbench.materials.list',
    scope
  )
  if (!listed.result.ok) {
    throw new RuntimeClientError(listed.result.error.code, listed.result.error.message)
  }
  let planSources: VersionTreePlanCatalog | undefined
  if (scope.workflow === 'acceptance') {
    const historyScope = {
      repoId: scope.repoId,
      worktreeId: scope.worktreeId,
      hostId: scope.hostId
    }
    const catalog = await ctx.client.call<VersionMaterialResult<VersionTreePlanCatalog>>(
      'workbench.history.listTreePlans',
      { scope: historyScope }
    )
    if (!catalog.result.ok) {
      throw new RuntimeClientError(catalog.result.error.code, catalog.result.error.message)
    }
    planSources = catalog.result.value
  }
  const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
  if (
    binding &&
    (binding.workflow !== scope.workflow || binding.version !== selected.result.value.version)
  ) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Workflow binding changed or does not match this session. Read the workspace again.'
    )
  }
  const context = {
    projectId: worktree.projectId || worktree.repoId,
    ...scope,
    workspacePath: worktree.path,
    version: binding?.version ?? null,
    branch: worktree.branch?.replace(/^refs\/heads\//, '') || null
  }
  const priorReview =
    scope.workflow === 'plan'
      ? await readWorkbenchPriorContext(
          ctx,
          scope,
          selected.result.value.version,
          listed.result.value.map((item) => item.version),
          worktree.projectId
        )
      : undefined
  printResult(
    {
      ...selected,
      result: {
        version: selected.result.value.version,
        context,
        candidates: listed.result.value,
        ...(planSources ? { planSources } : {}),
        ...(priorReview ? { priorReview } : {})
      }
    },
    ctx.json,
    (value) => JSON.stringify(value, null, 2)
  )
}

type PriorReviewContext =
  | { kind: 'unselected' | 'none' }
  | { kind: 'missing'; version: string }
  | { kind: 'ready'; source: PlanningProgressSource }
  | { kind: 'error'; reason: string }

/** The same adjacent-version and fixed-source checks as the planning board. */
async function readWorkbenchPriorContext(
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
