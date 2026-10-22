import { defineMethod } from '../core'
import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema
} from '../../../../shared/workbench/version-material-request'
import {
  VersionMigrationReadSchema,
  VersionMigrationApplySchema
} from '../../../../shared/workbench/version-material-migration'
import { materialResult } from '../../../workbench/version-material-error'
import { assertHumanFieldsUntouched } from '../../../workbench/material-human-guard'
import { nativeVersionMaterialService } from '../../../workbench/version-material-runtime'
import { versionSelection } from '../../../workbench/version-selection'

export const WORKBENCH_MATERIAL_METHODS = [
  defineMethod({
    name: 'workbench.materials.context',
    params: VersionMaterialScopeSchema,
    handler: (params, { runtime }) => materialResult(() => versionSelection(runtime, params))
  }),
  defineMethod({
    name: 'workbench.materials.select',
    params: VersionMaterialReadSchema,
    handler: (params, { runtime }) =>
      materialResult(() => versionSelection(runtime, params, params.version))
  }),
  defineMethod({
    name: 'workbench.materials.previewMigration',
    params: VersionMigrationReadSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionMaterialService(runtime).previewMigration(params))
  }),
  defineMethod({
    name: 'workbench.materials.migrate',
    params: VersionMigrationApplySchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionMaterialService(runtime).migrate(params))
  }),
  defineMethod({
    name: 'workbench.materials.list',
    params: VersionMaterialScopeSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionMaterialService(runtime).list(params))
  }),
  defineMethod({
    name: 'workbench.materials.read',
    params: VersionMaterialReadSchema,
    handler: (params, { runtime }) =>
      materialResult(() => nativeVersionMaterialService(runtime).read(params))
  }),
  defineMethod({
    name: 'workbench.materials.save',
    params: VersionMaterialSaveSchema,
    handler: (params, ctx) =>
      materialResult(async () => {
        const service = nativeVersionMaterialService(ctx.runtime)
        // Human-only conclusions enter through UI channels only; the CLI channel
        // (no clientKind) must round-trip them unchanged. Guard runs on the owning
        // runtime because the CLI client itself cannot be trusted.
        await assertHumanFieldsUntouched((input) => service.read(input), params, ctx)
        return service.save(params)
      })
  })
]
