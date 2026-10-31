import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { routeForOwner } from '@/lib/worktree-owner-route'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { WorkflowCommentsResult } from '../../../../shared/workbench/workflow-report'
import type { OverviewPull } from '../../../../shared/workbench/overview-pull'
import type { VersionMaterialResult } from '../../../../shared/workbench/version-material-request'
import type { CycleTaskSnapshot } from '../version-cycle/ports'
import type { VersionCatalogState } from '../use-version-catalog'
import { nativeTaskPortDeps } from '../native-task-port'
import { resolveReferenceRepo } from '../task-reference-repo'

type Method = 'workbench.overview.pull' | 'workbench.workflow.comments'
async function callProvider<T>(
  method: Method,
  catalog: VersionCatalogState,
  task: CycleTaskSnapshot,
  number: number,
  force: boolean
) {
  if (!catalog.scope) {
    throw new Error('项目来源未就绪')
  }
  const repo = resolveReferenceRepo(nativeTaskPortDeps(), catalog.scope, task.reference)
  if (!repo) {
    throw new Error('引用仓库未登记')
  }
  const sourceHost = parseExecutionHostId(task.source.hostId)
  const route = routeForOwner({ hostId: task.source.hostId })
  if (!sourceHost || !route) {
    throw new Error('来源宿主身份未知')
  }
  const result = await callRuntimeRpc<VersionMaterialResult<T>>(
    route.runtimeEnvironmentId
      ? { kind: 'environment', environmentId: route.runtimeEnvironmentId }
      : { kind: 'local' },
    method,
    {
      repoId: task.source.repoId ?? repo.id,
      hostId: sourceHost.kind === 'runtime' ? 'local' : sourceHost.id,
      pr: { provider: task.reference.provider, repository: task.reference.repository, number },
      ...(force ? { force } : {})
    },
    { timeoutMs: 60_000 }
  )
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.value
}

/** One read batch shares native PRs/comments across planned Issues; refresh creates a new batch. */
export function createOverviewProviderReader() {
  const reads = new Map<string, Promise<unknown>>()
  function read<T>(
    method: Method,
    catalog: VersionCatalogState,
    task: CycleTaskSnapshot,
    number: number,
    force = false
  ): Promise<T> {
    const key = JSON.stringify([
      method,
      task.source,
      task.reference.provider,
      task.reference.repository,
      number
    ])
    if (!reads.has(key)) {
      reads.set(key, callProvider<T>(method, catalog, task, number, force))
    }
    return reads.get(key)! as Promise<T>
  }
  return {
    pull: (catalog: VersionCatalogState, task: CycleTaskSnapshot, number: number) =>
      read<OverviewPull>('workbench.overview.pull', catalog, task, number),
    comments: (
      catalog: VersionCatalogState,
      task: CycleTaskSnapshot,
      number: number,
      force: boolean
    ) => read<WorkflowCommentsResult>('workbench.workflow.comments', catalog, task, number, force)
  }
}
