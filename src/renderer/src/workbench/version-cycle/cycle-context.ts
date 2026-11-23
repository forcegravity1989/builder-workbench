import type { createVersionMaterialPort } from '../../../../shared/workbench/version-material-client'
import type { TrunkUpdateResult } from '../../../../shared/workbench/trunk-update'
import type { ArchivePrPort, CycleScope, CycleSession, ReleaseStatusPort, TaskPort } from './ports'

/** Business screens consume native adapters without importing the shell component. */
export type VersionCycleContext = {
  scope: CycleScope | null
  worktreeId: string | null
  /** Native instance identity separates a recreated tree from its prior view state. */
  worktreeInstanceId?: string | null
  session: CycleSession | null
  version: string | null
  /** Native branch of the active worktree, for display. */
  branch: string | null
  taskPort: TaskPort
  archivePort: ArchivePrPort
  /** Release tag status port for the acceptance board's release row (#462). */
  releasePort: ReleaseStatusPort
  materialPort: ReturnType<typeof createVersionMaterialPort> | null
  error: string | null
  syncing?: boolean
  materialRefresh?: number
  /**
   * The「更新代码」button syncs this screen's fixed tree, then re-reads materials
   * either way. Never called on screen entry.
   */
  updateCode(): Promise<TrunkUpdateResult>
}
