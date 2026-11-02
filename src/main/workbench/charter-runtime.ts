import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import {
  execMessage,
  probeRemoteCharter,
  readTextFileGuarded,
  trimmedIntent
} from './charter-remote-probe'
import {
  BW_GITIGNORE_REL,
  CHARTER_BRANCH,
  PROJECT_TOML_REL,
  fillBlankCharterInToml,
  parseProjectToml,
  renderProjectToml,
  type ProjectCharter
} from '../../shared/workbench/project-charter'
import type {
  CharterReadRequest,
  CharterReadResult,
  CharterStatus,
  CharterStatusRequest,
  CharterSubmitOutcome,
  CharterSubmitRequest
} from '../../shared/workbench/charter'
import { gitExecFileAsync } from '../git/runner'
import { readGitBlobAtOidPath } from '../git/source-control/git-blob-read'
import { probeGitRemoteIdentity } from '../repo-git-remote-identity'
import { lookupOpenCharterPr, readCharterStatus } from './charter-pr-status'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceRepo
} from './workspace-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'
import { editProjectToml } from '../../shared/workbench/project-charter-edit'

import { createCharterReview } from './charter-create-review'
import { serializeCharterSubmission } from './charter-submit-queue'

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
    if (params.edit && parseExecutionHostId(executionHostId)?.kind === 'ssh') {
      return {
        mode: 'failed',
        stage: 'validate',
        error: 'SSH 来源暂不支持在此编辑，原文件未改动',
        filled: []
      }
    }

    const intent = trimmedIntent(params.intent)
    let reviewed: { content: string; changed: string[] } | null = null
    if (params.edit) {
      try {
        const current = await readTextFileGuarded(join(repo.path, PROJECT_TOML_REL))
        if (current.error) {
          throw new Error(current.error)
        }
        reviewed = editProjectToml(current.raw, params.edit.expectedRaw, intent)
      } catch (error) {
        return { mode: 'failed', stage: 'validate', error: execMessage(error), filled: [] }
      }
    }

    const identityProbe = await probeGitRemoteIdentity(repo.path, executionHostId)
    if (identityProbe.status !== 'resolved') {
      if (reviewed) {
        if (identityProbe.status !== 'no-remote') {
          return {
            mode: 'failed',
            stage: 'read',
            error: '读不到远端身份，草稿保留；恢复连接后重试',
            filled: []
          }
        }
        try {
          const current = await readTextFileGuarded(join(repo.path, PROJECT_TOML_REL))
          if (current.error || current.raw !== params.edit!.expectedRaw) {
            throw new Error(current.error || '项目信息已变化，请重新读取并核对')
          }
          await mkdir(join(repo.path, '.bw'), { recursive: true })
          await writeFile(join(repo.path, PROJECT_TOML_REL), reviewed.content, 'utf8')
          return { mode: 'local-only', saved: true, reason: '已保存到本机，尚未共享' }
        } catch (error) {
          return { mode: 'failed', stage: 'write', error: execMessage(error), filled: [] }
        }
      }
      return {
        mode: 'local-only',
        reason:
          identityProbe.status === 'no-remote'
            ? '这个项目还没挂远端,名片只写在本机工作区'
            : '读不到远端身份,名片只写在本机工作区'
      }
    }
    const identity = identityProbe.identity
    if (reviewed) {
      const existing = await readCharterStatus(repo, execOptions)
      if (
        existing.queryFailed ||
        existing.pr?.state === 'open' ||
        (existing.pr?.state === 'merged' && existing.headMatchesProposal !== true)
      ) {
        return {
          mode: 'failed',
          stage: 'validate',
          error: existing.queryFailed
            ? '未读到名片 PR 状态，请重试'
            : '已有名片 PR 待处理，请先查看并更新代码',
          filled: []
        }
      }
    }

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
    let content: string
    let filled: string[]
    if (reviewed) {
      content = reviewed.content
      filled = reviewed.changed
      const working = await readTextFileGuarded(tomlPath)
      if (working.error || (working.raw !== baseRaw && working.raw !== content)) {
        return {
          mode: 'failed',
          stage: 'read',
          error: '配置工作树有未提交的名片修改，请先核对；草稿已保留',
          filled: []
        }
      }
      const current = await readTextFileGuarded(join(repo.path, PROJECT_TOML_REL))
      if (current.error || current.raw !== params.edit!.expectedRaw) {
        return {
          mode: 'failed',
          stage: 'validate',
          error: '项目信息已变化，请重新读取并核对',
          filled: []
        }
      }
    } else if (baseRaw !== null) {
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
        await git(['commit', '-m', commitTitle, '--only', '--', PROJECT_TOML_REL, BW_GITIGNORE_REL])
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
        const ahead = await git([
          'rev-list',
          '--count',
          `origin/${CHARTER_BRANCH}..${CHARTER_BRANCH}`
        ])
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
    } else if (!reviewed) {
      // 无新内容且远端已同步:有开放 PR 就复用,没有才 noop;文案按真实态区分。
      const openPr = await lookupOpenCharterPr(repo, executionHostId, identity, execOptions)
      if (openPr) {
        return { mode: 'pr', pr: { ...openPr, adopted: true }, filled }
      }
      let merged = false
      try {
        const mainBlob = await readGitBlobAtOidPath(
          repo.path,
          'HEAD',
          PROJECT_TOML_REL,
          execOptions
        )
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

    return createCharterReview({
      repo,
      executionHostId,
      identity,
      execOptions,
      firstTime: params.firstTime,
      treePath,
      filled
    })
  }

  async function status(params: CharterStatusRequest): Promise<CharterStatus> {
    const repo = repoById(params.repoId)
    const execOptions = resolveWorkbenchGitExecOptions(runtime, repo)
    return readCharterStatus(repo, execOptions)
  }

  /**
   * 墙判据(G3):读注册仓主检出的 `.bw/project.toml`。在 owner runtime 本机
   * 用 node fs 读(与 renderer 本地 readProjectCharter 同语义);「不存在」与
   * 「没读成」分开回答,不互相冒充。
   */
  async function read(params: CharterReadRequest): Promise<CharterReadResult> {
    const repo = repoById(params.repoId)
    const { raw, error } = await readTextFileGuarded(join(repo.path, PROJECT_TOML_REL))
    if (error) {
      return { charter: null, raw: null, existed: true, error }
    }
    if (raw === null) {
      return { charter: null, raw: null, existed: false, error: null }
    }
    return { charter: parseProjectToml(raw), raw, existed: true, error: null }
  }

  return {
    probeRemote: probeRemoteCharter,
    submit: (params: CharterSubmitRequest) =>
      serializeCharterSubmission(JSON.stringify([params.scope.hostId, params.scope.repoId]), () =>
        submit(params)
      ),
    status,
    read
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
