import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { isCodeHubGitRemote, parseCodeHubRemote } from '../../shared/codehub'
import {
  execMessage,
  oneLine,
  probeRemoteCharter,
  readTextFileGuarded,
  trimmedIntent
} from './charter-remote-probe'
import {
  BW_GITIGNORE_REL,
  CHARTER_BRANCH,
  PROJECT_TOML_REL,
  fillBlankCharterInToml,
  renderProjectToml,
  type ProjectCharter
} from '../../shared/workbench/project-charter'
import type {
  CharterStatus,
  CharterStatusRequest,
  CharterSubmitOutcome,
  CharterSubmitRequest
} from '../../shared/workbench/charter'
import { createGitHubPullRequest } from '../github/client/create/create-github-pull-request'
import { getRepoDefaultBranchName } from '../source-control/repo-default-branch'
import { gitExecFileAsync } from '../git/runner'
import { readGitBlobAtOidPath } from '../git/source-control/git-blob-read'
import { probeGitRemoteIdentity } from '../repo-git-remote-identity'
import { createCodeHubMr } from '../codehub/mr-creation'
import { lookupOpenCharterPr, readCharterStatus } from './charter-pr-status'
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

    // 合并基 = HEAD 跟踪态(spec 规则 2;main b778da6ac 教训:树工作区的
    // 脏残留不算已接管,重试时也不能拿脏文件当基吞掉本次新值)。
    const tomlPath = join(treePath, PROJECT_TOML_REL)
    let baseRaw: string | null = null
    try {
      const headBlob = await readGitBlobAtOidPath(treePath, 'HEAD', PROJECT_TOML_REL, execOptions)
      if (headBlob.exists && !headBlob.failed) {
        if (headBlob.isBinary) {
          return { mode: 'failed', stage: 'read', error: '名片不是文本文件,未覆盖', filled: [] }
        }
        baseRaw = headBlob.content
      }
    } catch {
      // HEAD 读取没完成(不是确证不存在):退回树内文件作基,不可读则如实报错。
      const prior = await readTextFileGuarded(tomlPath)
      if (prior.error) {
        return { mode: 'failed', stage: 'read', error: prior.error, filled: [] }
      }
      baseRaw = prior.raw
    }
    const intent = trimmedIntent(params.intent)
    let content: string
    let filled: string[]
    if (baseRaw !== null) {
      const merged = fillBlankCharterInToml(baseRaw, intent)
      content = merged.content
      filled = merged.filled
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
      return { mode: 'failed', stage: 'write', error: `写树失败：${execMessage(e)}`, filled }
    }
    let madeCommit = false
    try {
      await git(['add', '--', PROJECT_TOML_REL, BW_GITIGNORE_REL])
      const status = await git(['status', '--porcelain', '--', PROJECT_TOML_REL, BW_GITIGNORE_REL])
      if (status.stdout.trim()) {
        const commitTitle = params.firstTime ? '项目约定' : '项目信息改动'
        await git(['commit', '-m', commitTitle])
        madeCommit = true
      }
    } catch (e) {
      return { mode: 'failed', stage: 'commit', error: `提交没成：${execMessage(e)}`, filled }
    }
    // 重试幂等:上次 commit 成、push 败时本地领先 origin,必须补推而不是 noop。
    let needPush = madeCommit
    if (!needPush) {
      try {
        await git(['rev-parse', '--verify', '--quiet', `origin/${CHARTER_BRANCH}`])
        const ahead = await git(['rev-list', '--count', `origin/${CHARTER_BRANCH}..${CHARTER_BRANCH}`])
        needPush = Number(ahead.stdout.trim()) > 0
      } catch {
        needPush = true
      }
    }
    if (needPush) {
      try {
        await git(['push', '-u', 'origin', CHARTER_BRANCH], 180_000)
      } catch (e) {
        return { mode: 'failed', stage: 'push', error: `推分支没成：${execMessage(e)}`, filled }
      }
    } else {
      // 无新内容且远端已同步:有开放 PR 就复用,没有才 noop;文案按真实态区分。
      const openPr = await lookupOpenCharterPr(repo.path, executionHostId, identity, execOptions)
      if (openPr) {
        return { mode: 'pr', pr: { ...openPr, adopted: true }, filled }
      }
      let merged = false
      try {
        const mainBlob = await readGitBlobAtOidPath(repo.path, 'HEAD', PROJECT_TOML_REL, execOptions)
        merged = mainBlob.exists && !mainBlob.failed
      } catch {
        merged = false
      }
      return {
        mode: 'noop',
        filled: [],
        note: merged
          ? '名片已合入仓里,没有可补的新内容,未改动'
          : `名片没有可补的新内容,${CHARTER_BRANCH} 也没有开放中的 PR(可能已被关闭)——需要时从「编辑名片」重新发起`
      }
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
      { localGitExecOptions: execOptions }
    )
    if (result.ok) {
      return {
        mode: 'pr',
        pr: { provider: 'github', number: result.number, url: result.url, adopted: false },
        filled
      }
    }
    if (result.existingReview && typeof result.existingReview.number === 'number') {
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
    return readCharterStatus(repo, execOptions)
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
