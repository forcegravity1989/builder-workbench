import type { WorkbenchPlanningStartResult } from '../../shared/workbench-planning'

export type { WorkbenchPlanningStartResult }

export type WorkbenchPlanningApi = {
  start: (workspacePath: string) => Promise<WorkbenchPlanningStartResult>
}
