import { ipcRenderer } from 'electron'
import type {
  WelinkReportConfigApi,
  WelinkReportConfigState
} from '../shared/workbench/welink-report-config'

// BW #553: the Integrations pane needs the locked/settings split to render
// the group-space input read-only when a build pins the space.
export const welinkReportConfigApi: WelinkReportConfigApi = {
  getState: (): Promise<WelinkReportConfigState> =>
    ipcRenderer.invoke('workbench:welink-report-config')
}
