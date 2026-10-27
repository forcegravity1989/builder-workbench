import { createCodeHubComment, deleteCodeHubComment, listCodeHubComments } from './comments'
import { resolve } from 'node:path'
import { parseCodeHubRemote } from '../../shared/codehub'
import { getRepoSshConnectionId } from '../../shared/execution-host'
import type { CodeHubApi, CodeHubRepoArgs } from '../../shared/codehub-api'
import type { Repo } from '../../shared/repo-types'
import type { CodeHubExecOptions } from './cli'
import { applyCodeHubIssueState } from './issue-state'
import { readCodeHubMrChanges, readCodeHubMrChecks } from './mr-reads'
import { listCodeHubProjectLabels } from './repo-reads'
import { listCodeHubTasks } from './work-items'
import { getCodeHubViewer } from './viewer'
import {
  assignCodeHubIssue,
  closeCodeHubMr,
  createCodeHubIssue,
  listCodeHubPipelines,
  mergeCodeHubMr,
  setCodeHubReviewers,
  updateCodeHubIssueLabels,
  updateCodeHubIssueTitle,
  viewCodeHubTask
} from './mutations'

export function createCodeHubService(deps: {
  resolveRepo: (args: CodeHubRepoArgs) => Repo | Promise<Repo>
  localGitOptions: (repo: Repo) => { wslDistro?: string }
}): CodeHubApi {
  async function context(args: CodeHubRepoArgs) {
    const repo = await deps.resolveRepo(args)
    if (resolve(repo.path) !== resolve(args.repoPath)) {
      throw new Error('Repository path does not match the registered repository')
    }
    // The native registry owns the selected remote; another configured remote
    // must not silently replace the project the Tasks page displays.
    const identity = repo.gitRemoteIdentity
    const remote =
      parseCodeHubRemote(identity?.remoteUrl) ?? parseCodeHubRemote(identity?.canonicalKey)
    if (!remote) {
      throw new Error('Repository remote is not CodeHub')
    }
    // Like gh/glab, hosted API calls run on the owning runtime. An SSH repo's
    // filesystem path is not a local cwd; WSL projects use the native runner.
    const execOptions: CodeHubExecOptions = getRepoSshConnectionId(repo)
      ? {}
      : { cwd: repo.path, ...deps.localGitOptions(repo) }
    return { remote, execOptions }
  }

  return {
    async viewer(args) {
      return getCodeHubViewer(await context(args))
    },
    async listTasks(args) {
      const target = await context(args)
      const limit = args.limit ?? 30
      const items = await listCodeHubTasks({ ...args, ...target, limit: limit + 1 })
      return { remote: target.remote, items: items.slice(0, limit), hasMore: items.length > limit }
    },
    async createIssue(args) {
      return createCodeHubIssue({ ...args, ...(await context(args)) })
    },
    async updateIssueTitle(args) {
      await updateCodeHubIssueTitle({ ...args, ...(await context(args)) })
    },
    async updateIssueLabels(args) {
      await updateCodeHubIssueLabels({ ...args, ...(await context(args)) })
    },
    async listLabels(args) {
      return listCodeHubProjectLabels(await context(args))
    },
    async setIssueState(args) {
      const { remote, execOptions } = await context(args)
      await applyCodeHubIssueState({
        host: remote.host,
        project: remote.project,
        issueNumber: args.iid,
        state: args.state,
        stateReason: args.stateReason,
        duplicateOf: args.duplicateOf,
        execOptions
      })
    },
    async closeMr(args) {
      await closeCodeHubMr({ ...args, ...(await context(args)) })
    },
    async assignIssue(args) {
      await assignCodeHubIssue({ ...args, ...(await context(args)) })
    },
    async mergeMr(args) {
      await mergeCodeHubMr({ ...args, ...(await context(args)) })
    },
    async setReviewers(args) {
      await setCodeHubReviewers({ ...args, ...(await context(args)) })
    },
    async listPipelines(args) {
      return listCodeHubPipelines({ ...args, ...(await context(args)) })
    },
    async mrChecks(args) {
      return readCodeHubMrChecks({ ...args, ...(await context(args)) })
    },
    async mrChanges(args) {
      return readCodeHubMrChanges({ ...args, ...(await context(args)) })
    },
    async viewTask(args) {
      return viewCodeHubTask({ ...args, ...(await context(args)) })
    },
    async listComments(args) {
      return listCodeHubComments({ ...args, ...(await context(args)) })
    },
    async createComment(args) {
      await createCodeHubComment({ ...args, ...(await context(args)) })
    },
    async deleteComment(args) {
      await deleteCodeHubComment({ ...args, ...(await context(args)) })
    }
  }
}
