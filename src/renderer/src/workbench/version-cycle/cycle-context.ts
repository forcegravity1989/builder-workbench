import type { createVersionMaterialPort } from '../../../../shared/workbench/version-material-client'
import type { ArchivePort, CycleScope, CycleSession, CycleSessionPort, TaskPort } from './ports'

/** Business screens consume native adapters without importing the shell component. */
export type VersionCycleContext = {
  scope: CycleScope | null
  worktreeId: string | null
  session: CycleSession | null
  sessions: CycleSession[]
  sessionPort: CycleSessionPort
  taskPort: TaskPort
  archivePort: ArchivePort
  materialPort: ReturnType<typeof createVersionMaterialPort> | null
  error: string | null
  associateVersion(version: string): Promise<void>
}
