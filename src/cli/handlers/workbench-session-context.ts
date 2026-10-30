import type { HandlerContext } from '../dispatch'
import { readWorkbenchPriorContext } from './workbench-prior-context'
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
  type VersionMaterialResult
} from '../../shared/workbench/version-material-request'
import {
  renderWorkbenchPrompt,
  type WorkbenchPromptContext
} from '../../shared/workbench/workflow-prompt'
import {
  materialProblemRequest,
  type CycleMaterialProblem
} from '../../shared/workbench/cycle-start-request'
import { MaterialVersion } from '../../shared/workbench/version-material'
import type { VersionTreePlanCatalog } from '../../shared/workbench/version-history'

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
  const context: WorkbenchPromptContext = {
    projectId: worktree.projectId || worktree.repoId,
    ...scope,
    workspacePath: worktree.path,
    version: binding?.version ?? null,
    branch: worktree.branch?.replace(/^refs\/heads\//, '') || null
  }
  const { WORKBENCH_SYSTEM_TEMPLATE } = await import('../bundled-skill-guides.js')
  const problems: CycleMaterialProblem[] = [
    ...listed.result.value.filter((item) => item.state !== 'ready'),
    ...(planSources?.problems ?? [])
      .filter((item) => MaterialVersion.safeParse(item.version).success)
      .map((item): CycleMaterialProblem => ({
        version: item.version,
        workflow: 'plan',
        state: item.code === 'migration-required' ? 'migration-required' : 'invalid',
        error: item.message
      }))
  ]
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
  const instructions = [
    renderWorkbenchPrompt({ context, systemTemplate: WORKBENCH_SYSTEM_TEMPLATE }).prompt,
    problems.length
      ? materialProblemRequest(problems, scope.workflow, selected.result.value.version)
      : '',
    priorReview?.kind === 'missing'
      ? `上版 ${priorReview.version} 尚无可用验收来源，回顾暂空；不要跳到更早版本或推断没有遗留。`
      : priorReview?.kind === 'error'
        ? `上版验收来源读取失败：${priorReview.reason}。不要改读其他记录或推断没有遗留。`
        : ''
  ]
    .filter(Boolean)
    .join('\n\n')
  printResult(
    {
      ...selected,
      result: {
        version: selected.result.value.version,
        context,
        candidates: listed.result.value,
        ...(planSources ? { planSources } : {}),
        ...(priorReview ? { priorReview } : {}),
        instructions
      }
    },
    ctx.json,
    (value) => JSON.stringify(value, null, 2)
  )
}
