import type { createVersionMaterialPort } from '../../../../shared/workbench/version-material-client'
import type { ArchivePrPort, CycleScope, CycleSession, TaskPort } from './ports'

/** Business screens consume native adapters without importing the shell component. */
export type VersionCycleContext = {
  scope: CycleScope | null
  worktreeId: string | null
  session: CycleSession | null
  version: string | null
  taskPort: TaskPort
  archivePort: ArchivePrPort
  materialPort: ReturnType<typeof createVersionMaterialPort> | null
  error: string | null
  syncing?: boolean
  materialRefresh?: number
  selectVersion(version: string): Promise<void>
}
