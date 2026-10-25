import { randomUUID } from 'node:crypto'
import type { ExecutionHostId } from '../../shared/execution-host'
import { getWorktreeExecutionHostId } from '../../shared/execution-host'
import type { DetectedWorktree, Worktree } from '../../shared/worktree/types'
import type { CreateWorktreeResult } from '../../shared/worktree/create-types'
import type {
  RuntimeRepoSearchRefs,
  RuntimeWorktreeRecord
} from '../../shared/runtime-worktree-contracts'
import type { RuntimeManagedWorktreeCreateArgs } from '../runtime/runtime-managed-worktree-create-types'
import { REPO_SEARCH_REFS_MAX_LIMIT } from '../../shared/repo-search-limits'
import { matchReusableBranchRef } from '../../shared/workbench/reusable-branch-ref'
import { normalizeStoredWorkbenchVersionBinding } from '../../shared/workbench/version-binding'
import {
  VERSION_FLOW_WORKFLOWS,
  VersionWorkspacePrepareSchema,
  versionFlowBranch,
  versionFlowTreeName,
  type VersionFlowWorkflow,
  type VersionWorkspacePrepareRequest,
  type VersionWorkspacePrepareResult,
  type VersionWorkspacePrepareStep
} from '../../shared/workbench/version-workspace-prepare'
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
import { WorkspaceScopeError } from './workspace-scope-error'

/** The native surfaces this thin service composes; creation never takes client paths. */
export type VersionWorkspacePrepareRuntime = VersionBindingRuntime & {
  listManagedWorktrees(
    repoSelector?: string,
    limit?: number,
    sourceDefaultsSupported?: boolean
  ): Promise<{ worktrees: RuntimeWorktreeRecord[] }>
  listDetectedManagedWorktrees(
    repoSelector: string,
    connectionId?: string | null,
    sourceDefaultsSupported?: boolean
  ): Promise<{ worktrees: DetectedWorktree[] }>
  searchRepoRefs(repoSelector: string, query: string, limit: number): Promise<RuntimeRepoSearchRefs>
  dedupeWorktreeCreate<T>(
    repoSelector: string,
    clientMutationId: string | undefined,
    run: () => Promise<T>
  ): Promise<T>
  createManagedWorktree(args: RuntimeManagedWorktreeCreateArgs): Promise<CreateWorktreeResult>
  removeManagedWorktree(
    worktreeSelector: string,
    options?: { hostId?: ExecutionHostId }
  ): Promise<unknown>
}

function errorCode(error: unknown): string {
  return error instanceof WorkspaceScopeError ? error.code : 'prepare-failed'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * G2 P2：新版本两棵流程树的准备编排（判据定稿见 version-workspace design「P2 落地」）。
 *
 * 宿主端预检（登记清单 + Git 扫描）→ 原生 dedupeWorktreeCreate 创建 → 创建结果
 * 核对（分支不符不绑定不标成功）→ instanceId 围栏写绑定 → 空计划 create-only
 * 初始化。步骤链非原子：失败保留已成功结果、逐步回报，重试即重入补齐。
 * 不启动 agent、不激活视图、不启用自动化、不 commit/push 材料。
 */
export function createVersionWorkspacePrepareService(
  host: WorkbenchWorkspaceHost,
  runtime: VersionWorkspacePrepareRuntime,
  materialExecutor: VersionMaterialExecutor
) {
  const repoResolver = createWorkbenchRepoResolver(host)
  const bindingService = createVersionBindingService(host, runtime)
  const materialService = createVersionMaterialService(host, materialExecutor)

  async function prepare(
    input: VersionWorkspacePrepareRequest
  ): Promise<VersionWorkspacePrepareResult> {
    const request = VersionWorkspacePrepareSchema.parse(input)
    const planBranch = versionFlowBranch(request.version, 'plan')
    const acceptanceBranch = versionFlowBranch(request.version, 'acceptance')
    if (!planBranch || !acceptanceBranch) {
      throw new WorkspaceScopeError(
        'invalid-version',
        `版本名 ${request.version} 不能组成合法的流程分支名，请换一个版本名`
      )
    }
    const { repo, hostId } = repoResolver.resolveRepo({
      repoId: request.repoId,
      hostId: request.hostId
    })
    const repoSelector = `id:${repo.id}`
    const onHost = (tree: Pick<Worktree, 'hostId'>) =>
      getWorktreeExecutionHostId(tree, repo) === hostId

    const findBound = (
      trees: readonly Worktree[],
      workflow: VersionFlowWorkflow
    ): Worktree | null =>
      trees.find((tree) => {
        if (tree.isArchived || !onHost(tree)) {
          return false
        }
        const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
        return binding?.version === request.version && binding.workflow === workflow
      }) ?? null

    async function listRegistered(): Promise<Worktree[]> {
      return (await runtime.listManagedWorktrees(repoSelector)).worktrees
    }

    async function initializePlanMaterial(
      treeId: string,
      branch: string
    ): Promise<NonNullable<VersionWorkspacePrepareStep['material']>> {
      const outcome = await materialService.initializeEmptyPlan(
        { repoId: repo.id, worktreeId: treeId, hostId, workflow: 'plan' },
        { version: request.version, cycleId: randomUUID(), expectedBranch: branch }
      )
      return outcome.created
        ? { state: 'initialized', revision: outcome.revision }
        : { state: 'existing', revision: outcome.revision }
    }

    /** 分支已有 ref 但无树占用时，把匹配 ref 交给原生创建复用同名分支（findNamedBaseRef 同口径，共享单实现）。 */
    async function findReusableBranchRef(branch: string): Promise<string | undefined> {
      const result = await runtime.searchRepoRefs(repoSelector, branch, REPO_SEARCH_REFS_MAX_LIMIT)
      const match = matchReusableBranchRef(result, branch)
      if (match.kind === 'unverifiable') {
        throw new WorkspaceScopeError(
          'branch-unverifiable',
          `无法完整确认分支 ${branch} 的来源，请在项目中核对分支后重试`
        )
      }
      if (match.kind === 'ambiguous') {
        throw new WorkspaceScopeError(
          'branch-ambiguous',
          `多个远端存在分支 ${branch}，请先在项目中检出要使用的分支后重试`
        )
      }
      return match.kind === 'ref' ? match.refName : undefined
    }

    async function prepareFlowTree(
      workflow: VersionFlowWorkflow,
      branch: string,
      problems: VersionWorkspacePrepareResult['problems']
    ): Promise<VersionWorkspacePrepareStep> {
      /** 复用已登记树：报 existing＋计划材料仍尝试 create-only 初始化（失败进 problems，不断步骤链）。 */
      async function existingStep(
        tree: Pick<Worktree, 'id' | 'instanceId'>
      ): Promise<VersionWorkspacePrepareStep> {
        const step: VersionWorkspacePrepareStep = {
          workflow,
          branch,
          state: 'existing',
          worktreeId: tree.id,
          ...(tree.instanceId !== undefined ? { instanceId: tree.instanceId } : {})
        }
        if (workflow === 'plan') {
          try {
            step.material = await initializePlanMaterial(tree.id, branch)
          } catch (error) {
            problems.push({ workflow, code: errorCode(error), message: errorMessage(error) })
          }
        }
        return step
      }

      // 1) 已绑定的活树 → 复用（重入补齐语义），计划材料仍尝试 create-only 初始化。
      const bound = findBound(await listRegistered(), workflow)
      if (bound) {
        return existingStep(bound)
      }

      // 2) Git 级占用（含未登记/外部树）：归属不能证明为本版流程树 → 拒绝，不劫持不清理。
      const holder = (await runtime.listDetectedManagedWorktrees(repoSelector)).worktrees.find(
        (tree) => tree.branch.replace(/^refs\/heads\//, '') === branch
      )
      if (holder) {
        const holderBinding = normalizeStoredWorkbenchVersionBinding(holder.workbenchVersionBinding)
        const ours =
          !holder.isArchived &&
          onHost(holder) &&
          holderBinding?.version === request.version &&
          holderBinding.workflow === workflow
        if (!ours) {
          // Why: 归档的自有绑定树仍占着 Git 分支（拒绝重建是对的），但「归属无法证明」
          // 报因失实——绑定可证归属；如实报「已归档占用」并指向取消归档/清理的恢复路径。
          const archivedOwn =
            holder.isArchived &&
            onHost(holder) &&
            holderBinding?.version === request.version &&
            holderBinding.workflow === workflow
          throw new WorkspaceScopeError(
            'branch-occupied',
            archivedOwn
              ? `分支 ${branch} 被已归档工作树 ${holder.path} 占用（绑定可证归属本版流程树）；归档树仍占分支、不能重建——如需继续请在原生项目取消归档或清理该树后重试`
              : `分支 ${branch} 已被工作树 ${holder.path} 占用，归属无法证明为本版流程树；请在原生项目中核对后重试`
          )
        }
        return existingStep(holder)
      }

      // 3) 创建：宿主端去重——双击/多窗口/共享端 in-flight 收敛为一次创建，
      //    失败重试重新发起（原生语义）。基线不传时沿项目已有 worktree base 配置。
      const baseRef = await findReusableBranchRef(branch)
      const result = await runtime.dedupeWorktreeCreate(
        repoSelector,
        `bw-version-prepare:${request.version}:${workflow}`,
        () =>
          runtime.createManagedWorktree({
            repoSelector,
            name: versionFlowTreeName(request.version, workflow),
            branchNameOverride: branch,
            ...(baseRef ? { baseBranch: baseRef } : {}),
            activate: false,
            setupDecision: 'inherit'
          })
      )
      const created = result.worktree
      const createdBranch = created.branch.replace(/^refs\/heads\//, '')
      if (createdBranch !== branch) {
        // uniquified = 竞态抢占了分支：不绑定、不初始化、不标成功。误建树沿原生
        // 删除链默认口径 best-effort 清理（不附 force/豁免，不放宽删除安全规则）。
        let cleaned = false
        try {
          await runtime.removeManagedWorktree(`id:${created.id}`, {
            hostId: getWorktreeExecutionHostId(created, repo)
          })
          cleaned = true
        } catch {
          cleaned = false
        }
        // 并行对手可能已建好正确树 → 重新发现并采用，不为看不见的竞态报错。
        const winner = findBound(await listRegistered(), workflow)
        if (winner) {
          return existingStep(winner)
        }
        throw new WorkspaceScopeError(
          'create-branch-mismatch',
          `原生创建未返回约定分支 ${branch}（实际 ${createdBranch}），误建工作树${
            cleaned ? '已按原生删除链清理' : '清理失败，请按原生规则手动处理'
          }；分支可能被仓内既有工作树占用，核对后重试`
        )
      }

      // 4) 绑定：创建链是 instanceId 围栏的天然必填点；身份缺失报错不写。
      if (created.instanceId === undefined) {
        throw new WorkspaceScopeError(
          'workspace-unavailable',
          `新建工作树 ${created.id} 缺实例身份，绑定未写入；树已保留、不会重复创建，也未归属本版。请在原生项目核对该树登记——直接重跑准备会因其占用分支如实拒绝，恢复归属需人工补绑定或清理该树`
        )
      }
      await bindingService.set({
        repoId: repo.id,
        worktreeId: created.id,
        hostId,
        instanceId: created.instanceId,
        binding: { schema: 1, version: request.version, workflow }
      })

      // 5) 空计划（仅计划树）：create-only，已有材料不覆盖；失败保留树与绑定并如实回报。
      const step: VersionWorkspacePrepareStep = {
        workflow,
        branch,
        state: 'created',
        worktreeId: created.id,
        instanceId: created.instanceId
      }
      if (workflow === 'plan') {
        try {
          step.material = await initializePlanMaterial(created.id, branch)
        } catch (error) {
          problems.push({ workflow, code: errorCode(error), message: errorMessage(error) })
        }
      }
      return step
    }

    const steps: VersionWorkspacePrepareStep[] = []
    const problems: VersionWorkspacePrepareResult['problems'] = []
    for (const workflow of VERSION_FLOW_WORKFLOWS) {
      const branch = versionFlowBranch(request.version, workflow)!
      try {
        steps.push(await prepareFlowTree(workflow, branch, problems))
      } catch (error) {
        // 步骤链非原子：本步失败保留前序成功结果，继续下一步，逐步如实回报。
        steps.push({ workflow, branch, state: 'failed' })
        problems.push({ workflow, code: errorCode(error), message: errorMessage(error) })
      }
    }
    return { version: request.version, steps, problems }
  }

  return { prepare }
}

/** A BW composition adapter over Orca's existing create/dedupe/removal and metadata APIs. */
export function nativeVersionWorkspacePrepare(runtime: VersionWorkspacePrepareRuntime) {
  return createVersionWorkspacePrepareService(
    nativeWorkbenchWorkspaceHost(runtime),
    runtime,
    executeVersionMaterial
  )
}
