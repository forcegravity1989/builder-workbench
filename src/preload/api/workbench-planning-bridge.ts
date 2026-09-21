import { ipcRenderer } from 'electron'
import { WORKBENCH_PLANNING_START_CHANNEL } from '../../shared/workbench-planning'
import type { PreloadApi } from '../api-types'

export const workbenchPlanningApi = {
  start: (workspacePath: string) =>
    ipcRenderer.invoke(WORKBENCH_PLANNING_START_CHANNEL, workspacePath)
} satisfies PreloadApi['workbenchPlanning']
