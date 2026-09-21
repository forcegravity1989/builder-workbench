import { app, ipcMain } from 'electron'
import { WORKBENCH_PLANNING_START_CHANNEL } from '../../shared/workbench-planning'
import { isWorkbenchProduct } from '../startup/workbench-product'
import {
  planningScriptCandidates,
  pythonCandidates,
  startPlanningWorkspace,
  type PlanningStartOk
} from './planning-server'

export function registerWorkbenchPlanningIpc(): void {
  if (!isWorkbenchProduct()) {
    return
  }
  ipcMain.handle(
    WORKBENCH_PLANNING_START_CHANNEL,
    async (_event, workspacePath: unknown): Promise<PlanningStartOk> => {
      if (typeof workspacePath !== 'string') {
        throw new Error('规划工作目录无效')
      }
      return startPlanningWorkspace(
        workspacePath,
        planningScriptCandidates(app.getAppPath(), process.cwd(), process.resourcesPath),
        pythonCandidates(process.platform)
      )
    }
  )
}
