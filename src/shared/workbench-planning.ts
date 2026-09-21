export const WORKBENCH_PLANNING_START_CHANNEL = 'workbench:planningStart'

export type WorkbenchPlanningStartResult = {
  url: string
  version: string
  data: string
  workspace: string
  reused: boolean
}
