import type { RuntimeWorktreeRecord } from '../../shared/runtime-worktree-contracts'
import type { VersionHistoryPort } from '../../shared/workbench/version-history'
import {
  WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
  normalizeStoredWorkbenchVersionBinding
} from '../../shared/workbench/version-binding'
import type {
  FixedWorkspaceEnsureRequest,
  FixedWorkspaceEnsureResult
} from '../../shared/workbench/fixed-workspace'
import {
  VERSION_FLOW_WORKFLOWS,
  VersionWorkspacePrepareSchema,
  versionFlowBranch,
  type VersionFlowWorkflow,
  type VersionWorkspacePrepareRequest,
  type VersionWorkspacePrepareResult,
  type VersionWorkspacePrepareStep
} from '../../shared/workbench/version-workspace-prepare'
import { getWorktreeExecutionHostId } from '../../shared/execution-host'
import {
  createWorkbenchRepoResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceHost
} from './workspace-resolver'
import { createVersionBindingService, type VersionBindingRuntime } from './version-binding-service'
import {
  createVersionMaterialService,
  type VersionMaterialExecutor
} from './version-material-service'
import { executeVersionMaterial } from './version-material-runtime'
import { nativeVersionHistoryService } from './version-history-runtime'
import { WorkspaceScopeError } from './workspace-scope-error'
import { initializeVersionWorkspacePlan } from './version-workspace-plan-initialize'

export type VersionWorkspacePrepareRuntime = VersionBindingRuntime & {
  listManagedWorktrees(
    repoSelector?: string,
    limit?: number,
    sourceDefaultsSupported?: boolean
  ): Promise<{ worktrees: RuntimeWorktreeRecord[] }>
  ensureWorkbenchFixedWorkspace(
    request: FixedWorkspaceEnsureRequest
  ): Promise<FixedWorkspaceEnsureResult>
}

const errorCode = (error: unknown) =>
  error instanceof WorkspaceScopeError ? error.code : 'prepare-failed'
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const preparing = new WeakMap<object, Map<string, Promise<VersionWorkspacePrepareResult>>>()

/** Fixed-tree preparation is shared with project/metrics; this layer owns version binding and materials. */
export function createVersionWorkspacePrepareService(
  host: WorkbenchWorkspaceHost,
  runtime: VersionWorkspacePrepareRuntime,
  materialExecutor: VersionMaterialExecutor,
  history?: Pick<VersionHistoryPort, 'list'>
) {
  const repoResolver = createWorkbenchRepoResolver(host)
  const bindingService = createVersionBindingService(host, runtime)
  const materialService = createVersionMaterialService(host, materialExecutor)

  async function runPrepare(
    input: VersionWorkspacePrepareRequest
  ): Promise<VersionWorkspacePrepareResult> {
    const request = VersionWorkspacePrepareSchema.parse(input)
    if (
      !versionFlowBranch(request.version, 'plan') ||
      !versionFlowBranch(request.version, 'acceptance')
    ) {
      throw new WorkspaceScopeError(
        'invalid-version',
        `版本名 ${request.version} 不能组成合法的流程分支名，请换一个版本名`
      )
    }
    const { repo, hostId } = repoResolver.resolveRepo(request)
    const listRegistered = async () =>
      (await runtime.listManagedWorktrees(`id:${repo.id}`)).worktrees
    const problems: VersionWorkspacePrepareResult['problems'] = []

    async function prepareFlowTree(
      workflow: VersionFlowWorkflow
    ): Promise<VersionWorkspacePrepareStep> {
      const branch = versionFlowBranch(request.version, workflow)!
      // Binding is the version identity; a user may rename or bind a different branch.
      const bound = (await listRegistered()).find((tree) => {
        const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
        return (
          !tree.isArchived &&
          getWorktreeExecutionHostId(tree, repo) === hostId &&
          binding?.version === request.version &&
          binding.workflow === workflow
        )
      })
      const { worktree: tree, state } = bound
        ? { worktree: bound, state: 'existing' as const }
        : await runtime.ensureWorkbenchFixedWorkspace({
            repoId: repo.id,
            hostId,
            kind: workflow,
            version: request.version,
            setupDecision: 'skip'
          })
      if (state === 'existing') {
        const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
        if (
          getWorktreeExecutionHostId(tree, repo) !== hostId ||
          binding?.version !== request.version ||
          binding.workflow !== workflow
        ) {
          throw new WorkspaceScopeError(
            'branch-occupied',
            `分支 ${branch} 的工作树 ${tree.path} 已存在，但未绑定为本版${
              workflow === 'plan' ? '计划' : '验收'
            }工作区；请在原生项目右击该树核对并绑定版本后重试`
          )
        }
      } else {
        if (tree.instanceId === undefined) {
          throw new WorkspaceScopeError(
            'workspace-unavailable',
            `新建工作树 ${tree.id} 缺实例身份，绑定未写入；树已保留，请在原生项目核对登记后绑定版本`
          )
        }
        await bindingService.set({
          repoId: repo.id,
          worktreeId: tree.id,
          hostId,
          instanceId: tree.instanceId,
          binding: {
            schema: WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
            version: request.version,
            workflow
          }
        })
      }
      const step: VersionWorkspacePrepareStep = {
        workflow,
        branch,
        state,
        worktreeId: tree.id,
        ...(tree.instanceId !== undefined ? { instanceId: tree.instanceId } : {})
      }
      if (workflow === 'plan') {
        try {
          step.material = await initializeVersionWorkspacePlan({
            scope: { repoId: repo.id, worktreeId: tree.id, hostId, workflow: 'plan' },
            version: request.version,
            branch,
            materialService,
            history,
            listRegistered,
            problems
          })
        } catch (error) {
          problems.push({ workflow, code: errorCode(error), message: errorMessage(error) })
        }
      }
      return step
    }

    const steps: VersionWorkspacePrepareStep[] = []
    for (const workflow of VERSION_FLOW_WORKFLOWS) {
      try {
        steps.push(await prepareFlowTree(workflow))
      } catch (error) {
        steps.push({
          workflow,
          branch: versionFlowBranch(request.version, workflow)!,
          state: 'failed'
        })
        problems.push({ workflow, code: errorCode(error), message: errorMessage(error) })
      }
    }
    return { version: request.version, steps, problems }
  }
  function prepare(input: VersionWorkspacePrepareRequest): Promise<VersionWorkspacePrepareResult> {
    const request = VersionWorkspacePrepareSchema.parse(input)
    const key = JSON.stringify([request.hostId, request.repoId, request.version])
    let requests = preparing.get(runtime)
    if (!requests) {
      requests = new Map()
      preparing.set(runtime, requests)
    }
    const pending = requests.get(key)
    if (pending) {
      return pending
    }
    // Keep binding and create-only material initialization inside the same in-flight operation.
    const run = runPrepare(request).finally(() => {
      if (requests!.get(key) === run) {
        requests!.delete(key)
      }
    })
    requests.set(key, run)
    return run
  }
  return { prepare }
}

export function nativeVersionWorkspacePrepare(
  runtime: VersionWorkspacePrepareRuntime & Parameters<typeof nativeVersionHistoryService>[0]
) {
  return createVersionWorkspacePrepareService(
    nativeWorkbenchWorkspaceHost(runtime),
    runtime,
    executeVersionMaterial,
    nativeVersionHistoryService(runtime)
  )
}
