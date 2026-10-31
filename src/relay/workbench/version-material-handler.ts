import { z } from 'zod'
import type { RelayDispatcher } from '../dispatcher'
import { createVersionMaterialWorkspace } from '../../main/workbench/version-material-workspace'
import { materialResult } from '../../main/workbench/version-material-error'
import { WorkbenchVersionBindingSchema } from '../../shared/workbench/version-binding'
import {
  VersionMaterialAddArtifactSchema,
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema,
  VersionMaterialInitializeSchema
} from '../../shared/workbench/version-material-request'

import {
  VersionMigrationReadSchema,
  VersionMigrationApplySchema
} from '../../shared/workbench/version-material-migration'

const Command = z.strictObject({
  target: z.strictObject({ repoPath: z.string().min(1), worktreePath: z.string().min(1) }),
  operation: z.enum([
    'list',
    'read',
    'save',
    'addArtifact',
    'previewMigration',
    'migrate',
    'initializeEmptyPlan'
  ]),
  request: z.unknown(),
  /** G2 (P3a)：绑定围栏随请求下发；缺省=无绑定树（旧语义逐字不变）。 */
  binding: WorkbenchVersionBindingSchema.nullable().optional()
})

/** Mounted on Orca's authenticated relay, after runtime inventory resolves the target paths. */
export function registerVersionMaterialRelay(dispatcher: Pick<RelayDispatcher, 'onRequest'>) {
  dispatcher.onRequest('workbench.materials.execute', async (params) => {
    const { target, operation, request, binding } = Command.parse(params)
    const workspace = createVersionMaterialWorkspace(target, undefined, binding ?? null)
    switch (operation) {
      case 'previewMigration':
        return materialResult(() =>
          workspace.previewMigration(VersionMigrationReadSchema.parse(request))
        )
      case 'migrate':
        return materialResult(() => workspace.migrate(VersionMigrationApplySchema.parse(request)))
      case 'list':
        return materialResult(() => workspace.list(VersionMaterialScopeSchema.parse(request)))
      case 'read':
        return materialResult(() => workspace.read(VersionMaterialReadSchema.parse(request)))
      case 'save':
        return materialResult(() => workspace.save(VersionMaterialSaveSchema.parse(request)))
      case 'addArtifact':
        return materialResult(() =>
          workspace.addArtifact(VersionMaterialAddArtifactSchema.parse(request))
        )
      case 'initializeEmptyPlan':
        return materialResult(() =>
          workspace.initializeEmptyPlan(VersionMaterialInitializeSchema.parse(request))
        )
    }
  })
}
