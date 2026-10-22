import { ipcRenderer } from 'electron'
import type { CodeHubApi } from '../shared/codehub-api'
export type {
  CodeHubApi,
  CodeHubRepoArgs,
  CodeHubListTasksArgs,
  CodeHubListTasksResult
} from '../shared/codehub-api'

export const codehubApi: CodeHubApi = {
  listTasks: (args) => ipcRenderer.invoke('codehub:listTasks', args),
  createIssue: (args) => ipcRenderer.invoke('codehub:createIssue', args),
  updateIssueTitle: (args) => ipcRenderer.invoke('codehub:updateIssueTitle', args),
  setIssueState: (args) => ipcRenderer.invoke('codehub:setIssueState', args),
  closeMr: (args) => ipcRenderer.invoke('codehub:closeMr', args),
  assignIssue: (args) => ipcRenderer.invoke('codehub:assignIssue', args),
  mergeMr: (args) => ipcRenderer.invoke('codehub:mergeMr', args),
  setReviewers: (args) => ipcRenderer.invoke('codehub:setReviewers', args),
  listPipelines: (args) => ipcRenderer.invoke('codehub:listPipelines', args),
  mrChecks: (args) => ipcRenderer.invoke('codehub:mrChecks', args),
  mrChanges: (args) => ipcRenderer.invoke('codehub:mrChanges', args),
  viewTask: (args) => ipcRenderer.invoke('codehub:viewTask', args),
  listComments: (args) => ipcRenderer.invoke('codehub:listComments', args),
  createComment: (args) => ipcRenderer.invoke('codehub:createComment', args),
  deleteComment: (args) => ipcRenderer.invoke('codehub:deleteComment', args)
}
