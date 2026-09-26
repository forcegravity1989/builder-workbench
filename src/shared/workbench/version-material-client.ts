import type { VersionDocumentSnapshot } from './version-document'
import type { VersionMaterial } from './version-material'
import type { VersionMigrationPreview } from './version-material-migration'
import type {
  VersionMaterialScope,
  VersionMaterialSave,
  VersionMaterialCandidate,
  VersionMaterialResult
} from './version-material-request'

type MaterialRuntimeCall = (args: {
  method: string
  params: unknown
}) => Promise<VersionMaterialResult<unknown>>

export class VersionMaterialPortError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly currentRevision?: string | null
  ) {
    super(message)
  }
}

/** Uses Orca's authenticated runtime bridge; the host owns path and branch authorization. */
export function createVersionMaterialPort(scope: VersionMaterialScope, call: MaterialRuntimeCall) {
  async function invoke<T>(operation: string, params: unknown): Promise<T> {
    const result = (await call({
      method: `workbench.materials.${operation}`,
      params
    })) as VersionMaterialResult<T>
    if (!result.ok) {
      throw new VersionMaterialPortError(
        result.error.code,
        result.error.message,
        result.error.currentRevision
      )
    }
    return result.value
  }
  return {
    context: () => invoke<{ version: string | null }>('context', scope),
    select: (version: string) => invoke<{ version: string | null }>('select', { ...scope, version }),
    previewMigration: (version: string, cycleId: string, sourceRevision?: string) =>
      invoke<VersionMigrationPreview>('previewMigration', {
        ...scope,
        version,
        cycleId,
        sourceRevision
      }),
    migrate: (version: string, cycleId: string, expectedRevision: string) =>
      invoke<VersionMigrationPreview & { snapshot: VersionDocumentSnapshot<VersionMaterial> }>(
        'migrate',
        { ...scope, version, cycleId, expectedRevision }
      ),
    list: () => invoke<VersionMaterialCandidate[]>('list', scope),
    read: (version: string) =>
      invoke<VersionDocumentSnapshot<VersionMaterial> | null>('read', { ...scope, version }),
    save: (input: Omit<VersionMaterialSave, keyof VersionMaterialScope>) =>
      invoke<VersionDocumentSnapshot<VersionMaterial>>('save', { ...input, ...scope })
  }
}
