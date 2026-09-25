import { PlanningMaterialSchema } from '../../shared/workbench/version-material'
import { VersionDocumentError } from '../../shared/workbench/version-document'
import {
  previewSchema2Migration,
  VersionMigrationReadSchema,
  VersionMigrationApplySchema,
  type VersionMigrationRead,
  type VersionMigrationApply
} from '../../shared/workbench/version-material-migration'
import type { createVersionDocumentStore } from './version-document-store'
import type { VersionMaterial } from '../../shared/workbench/version-material'

type MaterialStore = ReturnType<typeof createVersionDocumentStore<VersionMaterial>>

/** Uses the same document lock, revision condition and durable writer as normal saves. */
export function createVersionMaterialMigration(
  storeFor: (scope: VersionMigrationRead) => Promise<MaterialStore>
) {
  return {
    async previewMigration(input: VersionMigrationRead) {
      const request = VersionMigrationReadSchema.parse(input)
      const source = await (
        await storeFor(request)
      ).readLegacy(request.version, request.sourceRevision)
      return previewSchema2Migration(
        source.document,
        request.version,
        request.cycleId,
        source.revision
      )
    },
    async migrate(input: VersionMigrationApply) {
      const request = VersionMigrationApplySchema.parse(input)
      const store = await storeFor(request)
      const source = await store.readLegacy(request.version)
      if (source.revision !== request.expectedRevision) {
        throw new VersionDocumentError(
          'revision-conflict',
          '迁移源已变化，请重新预览后确认。',
          source.revision
        )
      }
      const preview = previewSchema2Migration(
        source.document,
        request.version,
        request.cycleId,
        source.revision
      )
      const snapshot = await store.migrateLegacy({
        version: request.version,
        expectedRevision: request.expectedRevision,
        document: PlanningMaterialSchema.parse(preview.plan)
      })
      return { ...preview, snapshot }
    }
  }
}
