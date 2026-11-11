import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import {
  MilestoneRecoveryKeySchema,
  MilestoneRecoveryWriteSchema
} from '../../shared/workbench/milestone-recovery'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { getTrustedUIRendererWebContents } from '../ipc/ui'
import { withSpan } from '../observability/tracer'
import { createMilestoneRecoveryStore } from './milestone-recovery'

export function registerMilestoneRecoveryHandlers(): void {
  const store = createMilestoneRecoveryStore(() =>
    join(getCanonicalUserDataPath(), 'workbench', 'milestone-drafts')
  )
  const authorize = (event: IpcMainInvokeEvent) => {
    if (
      event.sender !== getTrustedUIRendererWebContents() ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('本机草案恢复只允许当前应用窗口访问')
    }
  }
  ipcMain.handle('workbench:milestone-recovery-read', (event, key: unknown) => {
    authorize(event)
    return withSpan(
      'workbench.milestoneRecovery.read',
      () => store.read(MilestoneRecoveryKeySchema.parse(key)),
      { kind: 'server' }
    )
  })
  ipcMain.handle('workbench:milestone-recovery-write', (event, request: unknown) => {
    authorize(event)
    return withSpan(
      'workbench.milestoneRecovery.write',
      () => store.write(MilestoneRecoveryWriteSchema.parse(request)),
      { kind: 'server' }
    )
  })
}
