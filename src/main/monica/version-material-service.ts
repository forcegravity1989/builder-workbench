import {
  VersionMaterialAddArtifactSchema,
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema,
  type VersionMaterialScope,
  type VersionMaterialRead,
  type VersionMaterialSave,
  type VersionMaterialAddArtifact,
  type VersionMaterialInitialize
} from '../../shared/monica/version-material-request'
import {
  createMonicaWorkspaceResolver,
  type MonicaWorkspaceHost,
  type MonicaWorkspaceTarget
} from './workspace-resolver'
import {
  VersionMigrationReadSchema,
  VersionMigrationApplySchema,
  type VersionMigrationRead,
  type VersionMigrationApply
} from '../../shared/monica/version-material-migration'
import { normalizeStoredMonicaVersionBinding } from '../../shared/monica/version-binding'
import type { MonicaVersionBinding } from '../../shared/monica/version-binding'
import { WorkspaceScopeError } from './workspace-scope-error'
import type { createVersionMaterialWorkspace } from './version-material-workspace'
export { materialResult } from './version-material-error'

export type VersionMaterialHost = MonicaWorkspaceHost
export type VersionMaterialTarget = MonicaWorkspaceTarget
export type VersionMaterialExecutor = (
  target: VersionMaterialTarget,
  reauthorize: () => Promise<void>,
  binding?: MonicaVersionBinding | null
) => ReturnType<typeof createVersionMaterialWorkspace>

/** IDs are resolved on the owning Orca runtime; request payloads never grant path authority. */
export function createVersionMaterialService(
  host: VersionMaterialHost,
  execute: VersionMaterialExecutor
) {
  const resolver = createMonicaWorkspaceResolver(host)
  async function workspace(scope: VersionMaterialScope) {
    const { target, reauthorize, worktree } = await resolver.resolve(scope)
    const binding = normalizeStoredMonicaVersionBinding(worktree.workbenchVersionBinding)
    if (!binding || binding.workflow !== scope.workflow) {
      throw new WorkspaceScopeError('invalid-scope', '该工作树不是此用途的流程树，材料读写被拒绝')
    }
    return {
      workspace: execute(target, reauthorize, binding),
      binding
    }
  }
  function assertVersion(binding: MonicaVersionBinding, version: string): void {
    if (version !== binding.version) {
      throw new WorkspaceScopeError(
        'cross-version',
        `该工作树绑定版本 ${binding.version}，拒绝读写 ${version} 的材料`
      )
    }
  }
  return {
    async previewMigration(input: VersionMigrationRead) {
      const request = VersionMigrationReadSchema.parse(input)
      const resolved = await workspace(request)
      assertVersion(resolved.binding, request.version)
      return resolved.workspace.previewMigration(request)
    },
    async migrate(input: VersionMigrationApply) {
      const request = VersionMigrationApplySchema.parse(input)
      const resolved = await workspace(request)
      assertVersion(resolved.binding, request.version)
      return resolved.workspace.migrate(request)
    },
    async list(input: VersionMaterialScope) {
      const scope = VersionMaterialScopeSchema.parse(input)
      return (await workspace(scope)).workspace.list(scope)
    },
    async read(input: VersionMaterialRead) {
      const request = VersionMaterialReadSchema.parse(input)
      const resolved = await workspace(request)
      assertVersion(resolved.binding, request.version)
      return resolved.workspace.read(request)
    },
    async save(input: VersionMaterialSave) {
      const request = VersionMaterialSaveSchema.parse(input)
      const resolved = await workspace(request)
      assertVersion(resolved.binding, request.version)
      return resolved.workspace.save(request)
    },
    /** #516 制品登记：编排与文件校验都在拥有工作树的一侧（见 workspace.addArtifact）。 */
    async addArtifact(input: VersionMaterialAddArtifact) {
      const request = VersionMaterialAddArtifactSchema.parse(input)
      const resolved = await workspace(request)
      assertVersion(resolved.binding, request.version)
      return resolved.workspace.addArtifact(request)
    },
    /** G2 P2：新建流程树上的空计划初始化；create-only，已有材料不覆盖。 */
    async initializeEmptyPlan(scope: VersionMaterialScope, initialize: VersionMaterialInitialize) {
      const request = VersionMaterialScopeSchema.parse(scope)
      const resolved = await workspace(request)
      assertVersion(resolved.binding, initialize.version)
      return resolved.workspace.initializeEmptyPlan(initialize)
    }
  }
}
