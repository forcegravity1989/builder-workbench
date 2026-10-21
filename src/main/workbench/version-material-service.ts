import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema,
  type VersionMaterialScope,
  type VersionMaterialRead,
  type VersionMaterialSave,
  type VersionMaterialInitialize
} from '../../shared/workbench/version-material-request'
import {
  createWorkbenchWorkspaceResolver,
  type WorkbenchWorkspaceHost,
  type WorkbenchWorkspaceTarget
} from './workspace-resolver'
import {
  VersionMigrationReadSchema,
  VersionMigrationApplySchema,
  type VersionMigrationRead,
  type VersionMigrationApply
} from '../../shared/workbench/version-material-migration'
import type { createVersionMaterialWorkspace } from './version-material-workspace'
export { materialResult } from './version-material-error'

export type VersionMaterialHost = WorkbenchWorkspaceHost
export type VersionMaterialTarget = WorkbenchWorkspaceTarget
export type VersionMaterialExecutor = (
  target: VersionMaterialTarget,
  reauthorize: () => Promise<void>
) => ReturnType<typeof createVersionMaterialWorkspace>

/** IDs are resolved on the owning Orca runtime; request payloads never grant path authority. */
export function createVersionMaterialService(
  host: VersionMaterialHost,
  execute: VersionMaterialExecutor
) {
  const resolver = createWorkbenchWorkspaceResolver(host)
  async function workspace(scope: VersionMaterialScope) {
    const { target, reauthorize } = await resolver.resolve(scope)
    return execute(target, reauthorize)
  }
  return {
    async previewMigration(input: VersionMigrationRead) {
      const request = VersionMigrationReadSchema.parse(input)
      return (await workspace(request)).previewMigration(request)
    },
    async migrate(input: VersionMigrationApply) {
      const request = VersionMigrationApplySchema.parse(input)
      return (await workspace(request)).migrate(request)
    },
    async list(input: VersionMaterialScope) {
      const scope = VersionMaterialScopeSchema.parse(input)
      return (await workspace(scope)).list(scope)
    },
    async read(input: VersionMaterialRead) {
      const request = VersionMaterialReadSchema.parse(input)
      return (await workspace(request)).read(request)
    },
    async save(input: VersionMaterialSave) {
      const request = VersionMaterialSaveSchema.parse(input)
      return (await workspace(request)).save(request)
    },
    /** G2 P2：新建流程树上的空计划初始化；create-only，已有材料不覆盖。 */
    async initializeEmptyPlan(scope: VersionMaterialScope, initialize: VersionMaterialInitialize) {
      const request = VersionMaterialScopeSchema.parse(scope)
      return (await workspace(request)).initializeEmptyPlan(initialize)
    }
  }
}
