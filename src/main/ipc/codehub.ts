import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import { isCodeHubGitRemote, type CodeHubRemote } from '../../shared/codehub'
import type { GitHubIssueCloseReason } from '../../shared/issue-mutation-types'
import type { Repo } from '../../shared/repo-types'
import type { Store } from '../persistence'
import { applyCodeHubIssueState } from '../codehub/issue-state'
import { readCodeHubRemoteForRepo } from '../codehub/remote'
import { listCodeHubTasks } from '../codehub/work-items'
import {
  assignCodeHubIssue,
  closeCodeHubMr,
  createCodeHubComment,
  createCodeHubIssue,
  deleteCodeHubComment,
  listCodeHubComments,
  listCodeHubPipelines,
  mergeCodeHubMr,
  setCodeHubReviewers,
  updateCodeHubIssueTitle,
  viewCodeHubTask
} from '../codehub/mutations'

async function resolveCodeHubRepo(
  store: Store,
  args: { repoPath: string; repoId?: string | null }
): Promise<{ repo: Repo; remote: CodeHubRemote }> {
  const repoId = args.repoId?.trim()
  const repo = repoId
    ? store.getRepo(repoId)
    : store.getRepos().find((candidate) => resolve(candidate.path) === resolve(args.repoPath))
  if (!repo) {
    throw new Error('Repository is not registered')
  }
  if (!isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    throw new Error('Repository remote is not CodeHub')
  }
  const remote = await readCodeHubRemoteForRepo(repo.path)
  if (!remote) {
    throw new Error('CodeHub remote URL could not be read')
  }
  return { repo, remote }
}

export function registerCodeHubHandlers(store: Store): void {
  ipcMain.handle(
    'codehub:listTasks',
    async (
      _event,
      args: {
        repoPath: string
        repoId?: string | null
        kind: 'issue' | 'mr'
        state: 'opened' | 'closed' | 'merged' | 'all'
        limit?: number
        scope?: 'created_by_me' | 'assigned_to_me' | 'need_my_review'
        search?: string
        author?: string
        assignee?: string
      }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      return {
        remote,
        items: await listCodeHubTasks({
          remote,
          repoPath: repo.path,
          kind: args.kind,
          state: args.state,
          limit: args.limit,
          scope: args.scope,
          search: args.search,
          author: args.author,
          assignee: args.assignee
        })
      }
    }
  )

  ipcMain.handle(
    'codehub:createIssue',
    async (
      _event,
      args: {
        repoPath: string
        repoId?: string | null
        title: string
        description?: string
        assignee?: string
      }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      return createCodeHubIssue({
        remote,
        repoPath: repo.path,
        title: args.title,
        description: args.description,
        assignee: args.assignee
      })
    }
  )

  ipcMain.handle(
    'codehub:updateIssueTitle',
    async (
      _event,
      args: { repoPath: string; repoId?: string | null; iid: number; title: string }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      await updateCodeHubIssueTitle({
        remote,
        repoPath: repo.path,
        iid: args.iid,
        title: args.title
      })
    }
  )

  ipcMain.handle(
    'codehub:setIssueState',
    async (
      _event,
      args: {
        repoPath: string
        repoId?: string | null
        iid: number
        state: 'open' | 'closed'
        stateReason?: GitHubIssueCloseReason | null
        duplicateOf?: number | null
      }
    ) => {
      const { remote } = await resolveCodeHubRepo(store, args)
      await applyCodeHubIssueState({
        host: remote.host.replace(/:\d+$/, ''),
        project: remote.project,
        issueNumber: args.iid,
        state: args.state,
        stateReason: args.stateReason,
        duplicateOf: args.duplicateOf
      })
    }
  )

  ipcMain.handle(
    'codehub:closeMr',
    async (_event, args: { repoPath: string; repoId?: string | null; iid: number }) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      await closeCodeHubMr({ remote, repoPath: repo.path, iid: args.iid })
    }
  )

  ipcMain.handle(
    'codehub:assignIssue',
    async (
      _event,
      args: { repoPath: string; repoId?: string | null; iid: number; assignee: string }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      await assignCodeHubIssue({
        remote,
        repoPath: repo.path,
        iid: args.iid,
        assignee: args.assignee
      })
    }
  )

  ipcMain.handle(
    'codehub:mergeMr',
    async (
      _event,
      args: { repoPath: string; repoId?: string | null; iid: number; auto?: boolean }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      await mergeCodeHubMr({ remote, repoPath: repo.path, iid: args.iid, auto: args.auto })
    }
  )

  ipcMain.handle(
    'codehub:setReviewers',
    async (
      _event,
      args: { repoPath: string; repoId?: string | null; iid: number; reviewers: string[] }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      await setCodeHubReviewers({
        remote,
        repoPath: repo.path,
        iid: args.iid,
        reviewers: args.reviewers
      })
    }
  )

  ipcMain.handle(
    'codehub:viewTask',
    async (
      _event,
      args: { repoPath: string; repoId?: string | null; kind: 'issue' | 'mr'; iid: number }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      return viewCodeHubTask({ remote, repoPath: repo.path, kind: args.kind, iid: args.iid })
    }
  )

  ipcMain.handle(
    'codehub:listComments',
    async (
      _event,
      args: { repoPath: string; repoId?: string | null; kind: 'issue' | 'mr'; iid: number }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      return listCodeHubComments({ remote, repoPath: repo.path, kind: args.kind, iid: args.iid })
    }
  )

  ipcMain.handle(
    'codehub:createComment',
    async (
      _event,
      args: { repoPath: string; repoId?: string | null; kind: 'issue' | 'mr'; iid: number; body: string }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      await createCodeHubComment({
        remote,
        repoPath: repo.path,
        kind: args.kind,
        iid: args.iid,
        body: args.body
      })
    }
  )

  ipcMain.handle(
    'codehub:deleteComment',
    async (
      _event,
      args: {
        repoPath: string
        repoId?: string | null
        kind: 'issue' | 'mr'
        iid: number
        commentId: string
      }
    ) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      await deleteCodeHubComment({
        remote,
        repoPath: repo.path,
        kind: args.kind,
        iid: args.iid,
        commentId: args.commentId
      })
    }
  )

  ipcMain.handle(
    'codehub:listPipelines',
    async (_event, args: { repoPath: string; repoId?: string | null; iid: number }) => {
      const { repo, remote } = await resolveCodeHubRepo(store, args)
      return listCodeHubPipelines({ remote, repoPath: repo.path, iid: args.iid })
    }
  )
}
