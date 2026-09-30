import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { isCodeHubGitRemote, parseCodeHubRemote } from '../../shared/codehub'
import { execMessage, oneLine, probeRemoteCharter } from './charter-remote-probe'
import {
  BW_GITIGNORE_REL,
  CHARTER_BRANCH,
  PROJECT_TOML_REL,
  fillBlankCharterInToml,
  renderProjectToml,
  type ProjectCharter
} from '../../shared/workbench/project-charter'
import type {
  CharterIntent,
  CharterStatus,
  CharterStatusRequest,
  CharterSubmitOutcome,
  CharterSubmitRequest
} from '../../shared/workbench/charter'
import { createGitHubPullRequest } from '../github/client/create/create-github-pull-request'
import { getRepoDefaultBranchName } from '../source-control/repo-default-branch'
import { getHostedReviewForBranch } from '../source-control/hosted-review'
import { gitExecFileAsync } from '../git/runner'
import { readGitBlobAtOidPath } from '../git/source-control/git-blob-read'
import { probeGitRemoteIdentity } from '../repo-git-remote-identity'
import { createCodeHubMr, openCodeHubMrForBranch } from '../codehub/mr-creation'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceRepo
} from './workspace-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'

/** main v0.4 正本的 PR 正文;接入首建与编辑分别对应 create_project / edit_project_card。 */
const FIRST_CHARTER_BODY =
  '第一次接入写下的项目名片。合入之后这个仓就被管过了。\n\n这些件全是 Workbench 自己写的,没有起 agent。开工工具跟人走本机,不进仓。'
const EDIT_CHARTER_BODY = '项目信息改动,等人评审合入。'

export type CharterRuntimeHost = {
  listRepos: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['listRepos']
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
  listProjects: Parameters<typeof resolveWorkbenchGitExecOptions>[0]['listProjects']
}

function trimmedIntent(intent: CharterIntent): ProjectCharter {
  return {
    name: intent.name.trim(),
    kind: intent.kind.trim(),
    brief: intent.brief.trim(),
    benchmark: intent.benchmark.trim(),
    opportunity: intent.opportunity.trim()
  }
}

async function readTextFileGuarded(
  filePath: string
): Promise<{ raw: string | null; error: string | null }> {
  try {
    const buffer = await readFile(filePath)
    if (buffer.includes(0)) {
      return { raw: null, error: '名片不是文本文件,未覆盖' }
    }
    return { raw: buffer.toString('utf8'), error: null }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') {
      return { raw: null, error: null }
    }
    return { raw: null, error: `名片不可读,未覆盖：${execMessage(e)}` }
  }
}

function createCharterService(runtime: CharterRuntimeHost) {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))

  function repoById(repoId: string): WorkbenchWorkspaceRepo {
    const matches = runtime.listRepos().filter((repo) => repo.id === repoId)
    if (matches.length !== 1) {
      throw new WorkspaceScopeError('invalid-scope', '项目不存在或身份不唯一')
    }
    return matches[0]
  }

  async function submit(params: CharterSubmitRequest): Promise<CharterSubmitOutcome> {
    const { target, repo } = await resolver.resolve(params.scope)
    const execOptions = resolveWorkbenchGitExecOptions(runtime, repo)
    const treePath = target.worktreePath
    const git = (args: string[], timeout = 60_000) =>
      gitExecFileAsync(args, { ...execOptions, cwd: treePath, timeout })
    const executionHostId = getRepoExecutionHostId(repo as Repo)

    const identityProbe = await probeGitRemoteIdentity(repo.path, executionHostId)
    if (identityProbe.status !== 'resolved') {
      return {
        mode: 'local-only',
        reason:
          identityProbe.status === 'no-remote'
            ? '这个项目还没挂远端,名片只写在本机工作区'
            : '读不到远端身份,名片只写在本机工作区'
      }
    }
    const identity = identityProbe.identity

    // 树内现状:bw/project 树基于默认分支创建,HEAD 已合入的名片会出现在树里。
    const tomlPath = join(treePath, PROJECT_TOML_REL)
    const prior = await readTextFileGuarded(tomlPath)
    if (prior.error) {
      return { mode: 'failed', stage: 'read', error: prior.error, filled: [] }
    }
    const intent = trimmedIntent(params.intent)
    let content: string
    let filled: string[]
    if (prior.raw !== null) {
      const merged = fillBlankCharterInToml(prior.raw, intent)
      content = merged.content
      filled = merged.filled
      if (content === prior.raw) {
        return { mode: 'noop', filled: [] }
      }
    } else {
      if (!intent.name) {
        return { mode: 'failed', stage: 'validate', error: '项目名称不能为空', filled: [] }
      }
      content = renderProjectToml(intent)
      filled = (Object.keys(intent) as (keyof ProjectCharter)[]).filter((key) => intent[key])
    }

    // 写树(不写主检出),只提交名片两个路径。
    // WSL 仓的树路径经 UNC 由 node fs 读写;git 操作按 wslDistro 路由。
    try {
      await mkdir(dirname(tomlPath), { recursive: true })
      await writeFile(tomlPath, content, 'utf8')
      const gitignorePath = join(treePath, BW_GITIGNORE_REL)
      const gi = await readTextFileGuarded(gitignorePath)
      if (gi.raw === null && gi.error === null) {
        await writeFile(gitignorePath, 'worktrees/\n', 'utf8')
      }
    } catch (e) {
      return { mode: 'failed', stage: 'read', error: `写树失败：${execMessage(e)}`, filled }
    }
    try {
      await git(['add', '--', PROJECT_TOML_REL, BW_GITIGNORE_REL])
      const status = await git(['status', '--porcelain', '--', PROJECT_TOML_REL, BW_GITIGNORE_REL])
      if (!status.stdout.trim()) {
        return { mode: 'noop', filled }
      }
      const title = params.firstTime ? '项目约定' : '项目信息改动'
      await git(['commit', '-m', title])
    } catch (e) {
      return { mode: 'failed', stage: 'commit', error: `提交没成：${execMessage(e)}`, filled }
    }
    try {
      await git(['push', '-u', 'origin', CHARTER_BRANCH], 180_000)
    } catch (e) {
      return { mode: 'failed', stage: 'push', error: `推分支没成：${execMessage(e)}`, filled }
    }

    const body = params.firstTime ? FIRST_CHARTER_BODY : EDIT_CHARTER_BODY
    const title = params.firstTime ? '项目约定' : '项目信息改动'
    if (isCodeHubGitRemote(identity)) {
      const remote = parseCodeHubRemote(identity.remoteUrl)
      if (!remote) {
        return {
          mode: 'failed',
          stage: 'pr',
          error: `认不出 CodeHub 远端(${identity.remoteUrl}),分支已推到 ${CHARTER_BRANCH},可手动开 MR`,
          filled
        }
      }
      let targetBranch = ''
      try {
        const symbolic = await git(['symbolic-ref', 'refs/remotes/origin/HEAD'])
        targetBranch = symbolic.stdout.trim().replace(/^refs\/remotes\/origin\//, '')
      } catch {
        // origin/HEAD 没设过:退回默认分支探测,最后按 main 的内网惯例兜底 master。
      }
      if (!targetBranch) {
        targetBranch = (await getRepoDefaultBranchName(repo.path, null, execOptions)) || 'master'
      }
      try {
        const created = await createCodeHubMr({
          remote,
          execOptions,
          sourceBranch: CHARTER_BRANCH,
          targetBranch,
          title,
          description: body
        })
        return {
          mode: 'pr',
          pr: { provider: 'codehub', number: created.iid, url: created.url, adopted: created.adopted },
          filled
        }
      } catch (e) {
        return {
          mode: 'failed',
          stage: 'pr',
          error: `开 MR 没成：${execMessage(e)} —— 分支已推到 ${CHARTER_BRANCH},可手动开`,
          filled
        }
      }
    }
    const base = (await getRepoDefaultBranchName(treePath, null, execOptions)) || 'main'
    const result = await createGitHubPullRequest(
      treePath,
      { provider: 'github', base, head: CHARTER_BRANCH, title, body, draft: false },
      executionHostId,
      { localGitOptions: execOptions }
    )
    if (result.ok) {
      return {
        mode: 'pr',
        pr: { provider: 'github', number: result.number, url: result.url, adopted: false },
        filled
      }
    }
    if (result.existingReview) {
      return {
        mode: 'pr',
        pr: {
          provider: 'github',
          number: result.existingReview.number,
          url: result.existingReview.url,
          adopted: true
        },
        filled
      }
    }
    return {
      mode: 'failed',
      stage: 'pr',
      error: `开 PR 没成：${oneLine(result.error)} —— 分支已推到 ${CHARTER_BRANCH},可手动开`,
      filled
    }
  }

  async function status(params: CharterStatusRequest): Promise<CharterStatus> {
    const repo = repoById(params.repoId)
    const execOptions = resolveWorkbenchGitExecOptions(runtime, repo)
    const executionHostId = getRepoExecutionHostId(repo as Repo)
    let headHasCharter = false
    try {
      const blob = await readGitBlobAtOidPath(repo.path, 'HEAD', PROJECT_TOML_REL, execOptions)
      headHasCharter = blob.exists && !blob.failed
    } catch {
      headHasCharter = false
    }
    const identityProbe = await probeGitRemoteIdentity(repo.path, executionHostId)
    if (identityProbe.status !== 'resolved') {
      return { pr: null, headHasCharter }
    }
    const identity = identityProbe.identity
    try {
      if (isCodeHubGitRemote(identity)) {
        const remote = parseCodeHubRemote(identity.remoteUrl)
        if (!remote) {
          return { pr: null, headHasCharter }
        }
        const iid = await openCodeHubMrForBranch({
          remote,
          execOptions,
          sourceBranch: CHARTER_BRANCH
        })
        return {
          pr: iid === null ? null : { provider: 'codehub', number: iid, url: null, state: 'open' },
          headHasCharter
        }
      }
      const review = await getHostedReviewForBranch({
        repoPath: repo.path,
        executionHostId,
        branch: CHARTER_BRANCH,
        localGitOptions: execOptions
      })
      if (!review) {
        return { pr: null, headHasCharter }
      }
      const state = review.state === 'merged' ? 'merged' : review.state === 'closed' ? 'closed' : 'open'
      return {
        pr: { provider: 'github', number: review.number, url: review.url || null, state },
        headHasCharter
      }
    } catch {
      // 查询失败按「不知道」呈现,不装有事也不装没事。
      return { pr: null, headHasCharter }
    }
  }

  return {
    probeRemote: probeRemoteCharter,
    submit,
    status
  }
}

export type CharterService = ReturnType<typeof createCharterService>

const services = new WeakMap<object, CharterService>()

export function nativeCharterService(runtime: CharterRuntimeHost): CharterService {
  let service = services.get(runtime)
  if (!service) {
    service = createCharterService(runtime)
    services.set(runtime, service)
  }
  return service
}
