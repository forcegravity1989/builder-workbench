import { z } from 'zod'
import type { RelayDispatcher } from '../dispatcher'
import { createVersionMaterialWorkspace } from '../../main/workbench/version-material-workspace'
import { materialResult } from '../../main/workbench/version-material-error'
import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema
} from '../../shared/workbench/version-material-request'

const Command = z.strictObject({
  target: z.strictObject({ repoPath: z.string().min(1), worktreePath: z.string().min(1) }),
  operation: z.enum(['list', 'read', 'save']),
  request: z.unknown()
})

/** Mounted on Orca's authenticated relay, after runtime inventory resolves the target paths. */
export function registerVersionMaterialRelay(dispatcher: Pick<RelayDispatcher, 'onRequest'>) {
  dispatcher.onRequest('workbench.materials.execute', async (params) => {
    const { target, operation, request } = Command.parse(params)
    const workspace = createVersionMaterialWorkspace(target)
    switch (operation) {
      case 'list':
        return materialResult(() => workspace.list(VersionMaterialScopeSchema.parse(request)))
      case 'read':
        return materialResult(() => workspace.read(VersionMaterialReadSchema.parse(request)))
      case 'save':
        return materialResult(() => workspace.save(VersionMaterialSaveSchema.parse(request)))
    }
  })
}
