import type { createVersionMaterialPort } from '../../../../shared/workbench/version-material-client'
import type { TrunkUpdateResult } from '../../../../shared/workbench/trunk-update'
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
  /**
   * The「更新代码」button action: fast-forward this screen's fixed tree when Git
   * allows it, then re-read materials either way. Never called on screen entry.
   */
  updateCode(): Promise<TrunkUpdateResult>
}
