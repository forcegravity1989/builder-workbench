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
  /**
   * G2（#383）：绑定流程树的绑定版本（单一正本，跨版读写在 main 侧拒绝）；
   * 旧无绑定固定树为 null，屏内选版沿旧偏好语义保留。
   */
  boundVersion: string | null
  /**
   * G2（#383）：挂载流程树的真实分支（绑定树为 bw/<版本>/<workflow>，旧固定树即旧固定
   * 分支名）；页头分支 chip 与提示词钉分支同源，避免绑定树误显旧固定分支。无树为 null。
   */
  branch: string | null
  taskPort: TaskPort
  archivePort: ArchivePrPort
  /** Release tag status port for the acceptance board's release row (#462). */
  releasePort: ReleaseStatusPort
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
