import { readdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  VersionDocumentError,
  validatePlanningVersion
} from '../../shared/workbench/version-document'
import { compareMaterialVersions } from '../../shared/workbench/version-catalog'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type PlanningMaterial,
  type VersionMaterial
} from '../../shared/workbench/version-material'
import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema,
  VersionMaterialInitializeSchema,
  type VersionMaterialScope,
  type VersionMaterialRead,
  type VersionMaterialSave,
  type VersionMaterialCandidate,
  type VersionMaterialInitialize
} from '../../shared/workbench/version-material-request'
import { resolveGitDir } from '../git/source-control/resolve-git-dir'
import { resolveGitCommonDir } from '../git/source-control/resolve-git-common-dir'
import { WorkspaceScopeError } from './workspace-scope-error'
import { resolveWorktreeHostPath } from '../../shared/git-metadata-path'
import { createVersionDocumentStore } from './version-document-store'
import { isMissingFile, resolveVersionPlanningRoot } from './version-document-path'
import { createVersionMaterialMigration } from './version-material-migration'
import type { WorkbenchVersionBinding } from '../../shared/workbench/version-binding'
import type {
  VersionMigrationApply,
  VersionMigrationRead
} from '../../shared/workbench/version-material-migration'
import {
  LEGACY_PLAN_BRANCH,
  isVersionFlowWorkflow,
  legacyFlowBranch,
  versionFlowBranch
} from '../../shared/workbench/version-workspace-prepare'
import { branchFullRef } from '../../shared/workbench/branch-ref'

/** Runs on the filesystem owner; paths come from the authenticated native inventory adapter. */
export type VersionMaterialWorkspace = { repoPath: string; worktreePath: string }

export function createVersionMaterialWorkspace(
  target: VersionMaterialWorkspace,
  reauthorize?: () => Promise<void>,
  binding?: WorkbenchVersionBinding | null
) {
  const flowBinding = binding && isVersionFlowWorkflow(binding.workflow) ? binding : null
  /**
   * G2 (P3a)：绑定树的期望分支由绑定决定（版本归属由登记绑定承担，分支名不是
   * 身份）；无绑定树沿旧固定分支语义（旧上下文显式保留）。用途不符（目标/
   * Issue 树、计划树收验收范围等）一律拒绝——计划与验收用途不混。
   */
  function expectedBranchFor(scope: VersionMaterialScope): string {
    if (!binding) {
      return legacyFlowBranch(scope.workflow)
    }
    if (!flowBinding || flowBinding.workflow !== scope.workflow) {
      throw new WorkspaceScopeError('invalid-scope', '该工作树不是此用途的流程树，材料读写被拒绝')
    }
    const branch = versionFlowBranch(flowBinding.version, scope.workflow)
    if (!branch) {
      throw new WorkspaceScopeError('invalid-scope', '绑定版本无法组成合法流程分支，请核对登记')
    }
    return branch
  }
  /** 跨版围栏：本版树只能读写它绑定的材料版本（拒绝把 v0.7 的树用于 v0.8）。 */
  function assertBindingVersion(scope: VersionMaterialScope, version: string): void {
    if (flowBinding && flowBinding.workflow === scope.workflow && version !== flowBinding.version) {
      throw new WorkspaceScopeError(
        'cross-version',
        `该工作树绑定版本 ${flowBinding.version}，拒绝读写 ${version} 的材料`
      )
    }
  }
  // Git 身份围栏单实现（最终检视 M-1）：读写授权与创建期核对共用，防安全围栏漂移。
  async function assertTreeGitIdentity(expectedBranch: string): Promise<string> {
    await reauthorize?.()
    const root = await realpath(resolveWorktreeHostPath(target.worktreePath) ?? target.worktreePath)
    const gitDir = await resolveGitDir(root)
    const [repoCommon, treeCommon, head] = await Promise.all([
      resolveGitDir(target.repoPath).then(resolveGitCommonDir).then(realpath),
      resolveGitCommonDir(gitDir).then(realpath),
      readFile(join(gitDir, 'HEAD'), 'utf8')
    ])
    if (repoCommon !== treeCommon) {
      throw new WorkspaceScopeError('invalid-scope', '工作树不属于所选 Git 项目')
    }
    if (head.trim() !== `ref: ${branchFullRef(expectedBranch)}`) {
      throw new WorkspaceScopeError('wrong-branch', `请使用 ${expectedBranch} 工作树`)
    }
    return root
  }

  async function authorize(scope: VersionMaterialScope): Promise<string> {
    return assertTreeGitIdentity(expectedBranchFor(scope))
  }

  async function storeFor(scope: VersionMaterialScope) {
    const root = await authorize(scope)
    return createVersionDocumentStore<VersionMaterial>({
      trustedWorkspacePath: root,
      workflow: scope.workflow,
      decode: (value) =>
        scope.workflow === 'plan'
          ? PlanningMaterialSchema.parse(value)
          : AcceptanceMaterialSchema.parse(value),
      beforeCommit: async () => {
        if ((await authorize(scope)) !== root) {
          throw new WorkspaceScopeError('invalid-scope', '工作树位置已改变，请重新打开')
        }
      }
    })
  }

  /**
   * 创建期核对：树属于本仓库且 HEAD 正是创建约定的流程分支（不要求旧固定分支）。
   * 分支字符串在这里只做「写没写错树」的核对，版本归属由绑定登记承担。
   */
  async function authorizeCreatedTree(expectedBranch: string): Promise<string> {
    return assertTreeGitIdentity(expectedBranch)
  }

  const migration = createVersionMaterialMigration(storeFor)
  return {
    // 双围栏的执行器侧：迁移与初始化同样过绑定版本断言（服务层已断言，
    // 此处覆盖 relay 直达执行器的路径，纵深一致）。
    previewMigration: async (input: VersionMigrationRead) => {
      assertBindingVersion(input, input.version)
      return migration.previewMigration(input)
    },
    migrate: async (input: VersionMigrationApply) => {
      assertBindingVersion(input, input.version)
      return migration.migrate(input)
    },
    /**
     * G2 P2 空计划初始化：create-only（expectedRevision null），已有材料一律
     * 不覆盖并如实回报修订；已存在但读不懂的材料（migration-required/损坏）
     * 原样抛出，交迁移或人处理。走同一材料事务核心（互斥、原子替换）。
     */
    async initializeEmptyPlan(
      input: VersionMaterialInitialize
    ): Promise<{ created: boolean; revision: string }> {
      const request = VersionMaterialInitializeSchema.parse(input)
      // 绑定树围栏：初始化是计划用途操作，绑定必须正是该版计划流程。
      if (binding && (!flowBinding || flowBinding.workflow !== 'plan')) {
        throw new WorkspaceScopeError('invalid-scope', '该工作树不是计划流程树，初始化被拒绝')
      }
      if (
        flowBinding &&
        flowBinding.workflow === 'plan' &&
        request.version !== flowBinding.version
      ) {
        throw new WorkspaceScopeError(
          'cross-version',
          `该工作树绑定版本 ${flowBinding.version}，拒绝初始化 ${request.version} 的计划材料`
        )
      }
      if (!binding && request.expectedBranch !== LEGACY_PLAN_BRANCH) {
        // 无绑定树沿与读/写相同的旧语义：只认旧固定计划分支。expectedBranch 由
        // 请求方给出，缺此围栏时 relay 面可在任意已解析树初始化材料（纵深一致；
        // 现唯一调用方 prepare 恒先绑定后初始化，不会命中）。
        throw new WorkspaceScopeError('invalid-scope', '无绑定树仅支持在旧固定计划分支初始化材料')
      }
      const root = await authorizeCreatedTree(request.expectedBranch)
      const store = createVersionDocumentStore<PlanningMaterial>({
        trustedWorkspacePath: root,
        workflow: 'plan',
        decode: (value) => PlanningMaterialSchema.parse(value),
        beforeCommit: async () => {
          if ((await authorizeCreatedTree(request.expectedBranch)) !== root) {
            throw new WorkspaceScopeError('invalid-scope', '工作树位置已改变，请重新打开')
          }
        }
      })
      const existing = await store.read(request.version)
      if (existing) {
        return { created: false, revision: existing.revision }
      }
      const document: PlanningMaterial = {
        schema_version: 3,
        version: request.version,
        cycleId: request.cycleId,
        summary: {
          progress: '',
          risks: '',
          ...(request.progressSource ? { progressSource: request.progressSource } : {})
        },
        goals: [],
        tasks: []
      }
      try {
        const saved = await store.save({
          version: request.version,
          expectedRevision: null,
          document
        })
        return { created: true, revision: saved.revision }
      } catch (error) {
        // 并发首建：两 prepare 都读到空、都 create-only save，文件锁内后到者得
        // revision-conflict。材料恰被先到者创建一次（CAS 保证），对本调用是幂等
        // 「已存在」而非失败——重读回报真实修订，不让双击场景透出误导性冲突。
        if (error instanceof VersionDocumentError && error.code === 'revision-conflict') {
          const raced = await store.read(request.version)
          if (raced) {
            return { created: false, revision: raced.revision }
          }
        }
        throw error
      }
    },
    async list(input: VersionMaterialScope): Promise<VersionMaterialCandidate[]> {
      const scope = VersionMaterialScopeSchema.parse(input)
      const root = await authorize(scope)
      const planningRoot = await resolveVersionPlanningRoot(root)
      let entries
      try {
        entries = await readdir(planningRoot, { withFileTypes: true })
      } catch (error) {
        if (isMissingFile(error)) {
          return []
        }
        throw error
      }
      const store = await storeFor(scope)
      const candidates: VersionMaterialCandidate[] = []
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue
        }
        try {
          validatePlanningVersion(entry.name)
        } catch {
          continue
        }
        // 绑定树只呈现自己绑定的版本（检出目录含全部历史版本材料，跨版读取
        // 由断言拒绝；列表先收窄，客户端不靠列表冒充跨版可见性）。
        if (
          flowBinding &&
          flowBinding.workflow === scope.workflow &&
          entry.name !== flowBinding.version
        ) {
          continue
        }
        try {
          if (await store.read(entry.name)) {
            candidates.push({ version: entry.name, state: 'ready' })
          }
        } catch (error) {
          if (!(error instanceof VersionDocumentError)) {
            throw error
          }
          candidates.push({
            version: entry.name,
            state: error.code === 'migration-required' ? 'migration-required' : 'invalid',
            error: error.message
          })
        }
      }
      return candidates.sort((a, b) => compareMaterialVersions(a.version, b.version))
    },
    async read(input: VersionMaterialRead) {
      const request = VersionMaterialReadSchema.parse(input)
      assertBindingVersion(request, request.version)
      return (await storeFor(request)).read(request.version)
    },
    async save(input: VersionMaterialSave) {
      const request = VersionMaterialSaveSchema.parse(input)
      assertBindingVersion(request, request.version)
      return (await storeFor(request)).save(request)
    }
  }
}
