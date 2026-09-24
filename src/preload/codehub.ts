import { ipcRenderer } from 'electron'
import type { CodeHubRemote } from '../shared/codehub'
import type { GitHubIssueCloseReason } from '../shared/issue-mutation-types'
import type {
  CodeHubComment,
  CodeHubPipeline,
  CodeHubTaskDetail,
  CodeHubTaskItem
} from '../shared/codehub-tasks'

export type CodeHubRepoArgs = {
  repoPath: string
  repoId?: string | null
}

export type CodeHubListTasksArgs = CodeHubRepoArgs & {
  kind: 'issue' | 'mr'
  state: 'opened' | 'closed' | 'merged' | 'all'
  limit?: number
  scope?: 'created_by_me' | 'assigned_to_me' | 'need_my_review'
  search?: string
  author?: string
  assignee?: string
}

export type CodeHubListTasksResult = {
  remote: CodeHubRemote
  items: CodeHubTaskItem[]
}

export type CodeHubCreatedIssue = {
  iid: number | null
  url: string | null
  title: string
}

export const codehubApi = {
  listTasks: (args: CodeHubListTasksArgs): Promise<CodeHubListTasksResult> =>
    ipcRenderer.invoke('codehub:listTasks', args),
  createIssue: (
    args: CodeHubRepoArgs & { title: string; description?: string; assignee?: string }
  ): Promise<CodeHubCreatedIssue> => ipcRenderer.invoke('codehub:createIssue', args),
  updateIssueTitle: (args: CodeHubRepoArgs & { iid: number; title: string }): Promise<void> =>
    ipcRenderer.invoke('codehub:updateIssueTitle', args),
  setIssueState: (
    args: CodeHubRepoArgs & {
      iid: number
      state: 'open' | 'closed'
      stateReason?: GitHubIssueCloseReason | null
      duplicateOf?: number | null
    }
  ): Promise<void> => ipcRenderer.invoke('codehub:setIssueState', args),
  closeMr: (args: CodeHubRepoArgs & { iid: number }): Promise<void> =>
    ipcRenderer.invoke('codehub:closeMr', args),
  assignIssue: (args: CodeHubRepoArgs & { iid: number; assignee: string }): Promise<void> =>
    ipcRenderer.invoke('codehub:assignIssue', args),
  mergeMr: (args: CodeHubRepoArgs & { iid: number; auto?: boolean }): Promise<void> =>
    ipcRenderer.invoke('codehub:mergeMr', args),
  setReviewers: (args: CodeHubRepoArgs & { iid: number; reviewers: string[] }): Promise<void> =>
    ipcRenderer.invoke('codehub:setReviewers', args),
  listPipelines: (args: CodeHubRepoArgs & { iid: number }): Promise<CodeHubPipeline[]> =>
    ipcRenderer.invoke('codehub:listPipelines', args),
  viewTask: (
    args: CodeHubRepoArgs & { kind: 'issue' | 'mr'; iid: number }
  ): Promise<CodeHubTaskDetail> => ipcRenderer.invoke('codehub:viewTask', args),
  listComments: (
    args: CodeHubRepoArgs & { kind: 'issue' | 'mr'; iid: number }
  ): Promise<CodeHubComment[]> => ipcRenderer.invoke('codehub:listComments', args),
  createComment: (
    args: CodeHubRepoArgs & { kind: 'issue' | 'mr'; iid: number; body: string }
  ): Promise<void> => ipcRenderer.invoke('codehub:createComment', args),
  deleteComment: (
    args: CodeHubRepoArgs & { kind: 'issue' | 'mr'; iid: number; commentId: string }
  ): Promise<void> => ipcRenderer.invoke('codehub:deleteComment', args)
}

export type CodeHubApi = typeof codehubApi
