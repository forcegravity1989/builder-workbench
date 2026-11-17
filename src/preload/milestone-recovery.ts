import { ipcRenderer } from 'electron'
import type { MilestoneRecoveryApi } from '../shared/monica/milestone-recovery'

export const milestoneRecoveryApi: MilestoneRecoveryApi = {
  read: (key) => ipcRenderer.invoke('workbench:milestone-recovery-read', key),
  write: (request) => ipcRenderer.invoke('workbench:milestone-recovery-write', request)
}
