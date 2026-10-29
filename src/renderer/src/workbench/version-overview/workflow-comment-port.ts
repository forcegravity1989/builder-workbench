import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { routeForOwner } from '@/lib/worktree-owner-route'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { WorkflowCommentsResult } from '../../../../shared/workbench/workflow-report'
import type { VersionMaterialResult } from '../../../../shared/workbench/version-material-request'
import type { CycleTaskSnapshot } from '../version-cycle/ports'
import type { VersionCatalogState } from '../use-version-catalog'
import { nativeTaskPortDeps } from '../native-task-port'
import { resolveReferenceRepo } from '../task-reference-repo'

export async function readNativeWorkflowComments(
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
    throw new Error('指标引用仓库未登记')
  }
  const sourceHost = parseExecutionHostId(task.source.hostId)
  const route = routeForOwner({
    hostId: task.source.hostId
  })
  if (!sourceHost || !route) {
    throw new Error('指标来源宿主身份未知')
  }
  const result = await callRuntimeRpc<VersionMaterialResult<WorkflowCommentsResult>>(
    route.runtimeEnvironmentId
      ? { kind: 'environment', environmentId: route.runtimeEnvironmentId }
      : { kind: 'local' },
    'workbench.workflow.comments',
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
