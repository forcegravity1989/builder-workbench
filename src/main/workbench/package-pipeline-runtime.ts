import { parseExecutionHostId } from '../../shared/execution-host'
import type { MetricScope } from '../../shared/workbench/metrics'
import type {
  PackageDownloadReceipt,
  PackageLaunchReceipt,
  PackageLatest,
  PackagePipelineCatalog,
  PackagePipelinePort
} from '../../shared/workbench/package-pipeline'
import { isCodeHubGitRemote } from '../../shared/codehub'
import { parseGitHubOwnerRepo } from '../github/github-repository-identity'
import { gitExecFileAsync } from '../git/runner'
import type { GitRemoteIdentity } from '../../shared/git-remote-identity'
import { probeGitRemoteIdentity } from '../repo-git-remote-identity'
import { launchCloudDragonPipeline, listCloudDragonPipelines } from './cloud-dragon-cli-ops'
import { downloadCloudDragonPackage, readCloudDragonLatest } from './cloud-dragon-package-ops'
import {
  downloadGitHubPackage,
  launchGitHubPipeline,
  listGitHubPipelines,
  readGitHubLatest,
  type GitHubRepo
} from './github-package-ops'
import { PackagePipelineError } from './package-pipeline-error'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceRepo
} from './workspace-resolver'

/**
 * 出包运行时入口：一条协议两个宿主。scope 解析出工作树后按远端身份分流——
 * CodeHub 远端的执行面（list/launch）走本机 cloudbuild CLI、制品面
 * （latest/download）走 CloudDragon 浏览器会话，其余（GitHub）走本机 gh CLI。
 * 分派只看 remote URL，界面与协议不感知宿主差异。
 */

export type PackageRuntimeHost = {
  listRepos: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['listRepos']
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
  listProjects: Parameters<typeof resolveWorkbenchGitExecOptions>[0]['listProjects']
}

/** 两条链路都依赖本机环境（cb / CloudDragon 登录态、gh 登录 + 本地工作树）。 */
function assertLocalHost(scope: MetricScope): void {
  const host = parseExecutionHostId(scope.hostId)
  if (host?.kind === 'ssh') {
    throw new PackagePipelineError(
      'remote-unsupported',
      '出包依赖本机环境（CloudDragon 登录态或 gh 登录），请在本地宿主的工作树上操作'
    )
  }
}

/** github.com 走专用解析；非默认宿主（GHES）从规范化键 host/owner/repo 取尾部。 */
function resolveGitHubRepo(identity: GitRemoteIdentity): GitHubRepo | null {
  const parsed = parseGitHubOwnerRepo(identity.remoteUrl)
  if (parsed) {
    return { owner: parsed.owner, repo: parsed.repo }
  }
  const parts = identity.canonicalKey.split('/').filter(Boolean)
  const owner = parts.at(-2)
  const repo = parts.at(-1)
  if (parts.length < 3 || !owner || !repo) {
    return null
  }
  return { owner, repo }
}

function gitHubHost(identity: GitRemoteIdentity): string {
  return identity.canonicalKey.split('/')[0] || 'github.com'
}

type PackageTarget = {
  repoPath: string
  worktreePath: string
  execOptions: { wslDistro?: string }
  identity: GitRemoteIdentity
}

export function packagePipelineService(runtime: PackageRuntimeHost): PackagePipelinePort {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))

  // One launch at a time: double-clicking 出包 must not start the pipeline twice.
  let launchInFlight: Promise<PackageLaunchReceipt> | null = null

  async function resolveTarget(scope: MetricScope): Promise<PackageTarget> {
    const { target, repo } = await resolver.resolve(scope)
    const execOptions = resolveWorkbenchGitExecOptions(runtime, repo as WorkbenchWorkspaceRepo)
    const parsedHost = parseExecutionHostId(scope.hostId)
    if (!parsedHost) {
      throw new PackagePipelineError('invalid-scope', '无法识别工作树所属的宿主')
    }
    const probe = await probeGitRemoteIdentity(target.repoPath, parsedHost.id)
    if (probe.status !== 'resolved') {
      throw new PackagePipelineError('no-remote', '这个项目没有可识别的远端，无法出包')
    }
    return {
      repoPath: target.repoPath,
      worktreePath: target.worktreePath,
      execOptions,
      identity: probe.identity
    }
  }

  async function currentBranch(target: PackageTarget): Promise<string> {
    try {
      const { stdout } = await gitExecFileAsync(['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: target.worktreePath,
        ...target.execOptions,
        timeout: 60_000
      })
      const branch = stdout.trim()
      if (!branch || branch === 'HEAD') {
        throw new PackagePipelineError('detached-head', '工作树不在分支上，无法确定出包的分支')
      }
      return branch
    } catch (error) {
      if (error instanceof PackagePipelineError) {
        throw error
      }
      throw new PackagePipelineError('branch-read-failed', '读不出工作树的当前分支，无法出包')
    }
  }

  function githubContext(target: PackageTarget, repo: GitHubRepo) {
    return {
      repo,
      host: gitHubHost(target.identity),
      cwd: target.repoPath,
      wslDistro: target.execOptions.wslDistro
    }
  }

  return {
    async list({ scope }): Promise<PackagePipelineCatalog> {
      assertLocalHost(scope)
      const target = await resolveTarget(scope)
      if (isCodeHubGitRemote(target.identity)) {
        return { scope, pipelines: await listCloudDragonPipelines() }
      }
      const repo = resolveGitHubRepo(target.identity)
      if (!repo) {
        throw new PackagePipelineError('no-remote', '认不出远端的仓库身份，无法列出出包流水线')
      }
      return { scope, pipelines: await listGitHubPipelines(githubContext(target, repo)) }
    },

    async latest({ scope, pipeline }): Promise<PackageLatest | null> {
      assertLocalHost(scope)
      const target = await resolveTarget(scope)
      if (isCodeHubGitRemote(target.identity)) {
        return readCloudDragonLatest(pipeline)
      }
      const repo = resolveGitHubRepo(target.identity)
      if (!repo) {
        return null
      }
      return readGitHubLatest(githubContext(target, repo))
    },

    async launch({ scope, pipeline }): Promise<PackageLaunchReceipt> {
      assertLocalHost(scope)
      if (launchInFlight) {
        throw new PackagePipelineError('launch-busy', '已有一次流水线启动正在进行，请稍候')
      }
      const run = (async () => {
        const target = await resolveTarget(scope)
        if (isCodeHubGitRemote(target.identity)) {
          await launchCloudDragonPipeline(pipeline)
        } else {
          const repo = resolveGitHubRepo(target.identity)
          if (!repo) {
            throw new PackagePipelineError('no-remote', '认不出远端的仓库身份，无法启动出包流水线')
          }
          const ref = await currentBranch(target)
          await launchGitHubPipeline(githubContext(target, repo), pipeline, ref)
        }
        return { pipeline, launchedAt: new Date().toISOString() }
      })()
      launchInFlight = run
      try {
        return await run
      } finally {
        launchInFlight = null
      }
    },

    async download({ scope, pipeline, directory }): Promise<PackageDownloadReceipt> {
      assertLocalHost(scope)
      const target = await resolveTarget(scope)
      if (isCodeHubGitRemote(target.identity)) {
        return downloadCloudDragonPackage(pipeline, directory)
      }
      const repo = resolveGitHubRepo(target.identity)
      if (!repo) {
        throw new PackagePipelineError('no-remote', '认不出远端的仓库身份，无法下载制品包')
      }
      return downloadGitHubPackage(githubContext(target, repo), directory)
    }
  }
}
