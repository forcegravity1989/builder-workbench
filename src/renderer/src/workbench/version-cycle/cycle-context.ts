import type { createVersionMaterialPort } from '../../../../shared/workbench/version-material-client'
import type { ArchivePort, CycleScope, CycleSession, CycleSessionPort, TaskPort } from './ports'

/** Business screens consume native adapters without importing the shell component. */
export type VersionCycleContext = {
  scope: CycleScope | null
  worktreeId: string | null
  session: CycleSession | null
  version: string | null
  sessionPort: CycleSessionPort
  taskPort: TaskPort
  archivePort: ArchivePort
  materialPort: ReturnType<typeof createVersionMaterialPort> | null
  error: string | null
  selectVersion(version: string): Promise<void>
  startRequest?(text: string): Promise<void>
}
