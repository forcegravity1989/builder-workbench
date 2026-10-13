import { parseWslPath } from '../wsl'
import {
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext
} from '../github/gh-utils'
import { githubHostExecOptions } from '../github/github-api-repository'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from '../github/rate-limit'
import { githubRepoIdentityKey } from '../../shared/github/repository-identity-key'
import { isCodeHubGitRemote } from '../../shared/codehub'
import type {
  ArchivePrStatusRequest,
  ArchivePrStatusResult
} from '../../shared/workbench/archive-pr-status'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost
} from './workspace-resolver'

type RestPull = { state?: unknown; merged_at?: unknown; html_url?: unknown }

/**
 * Thin archive PR status: one `pulls/{n}` read keyed by the model-recorded
 * reference — no byte proof, no branch-name discovery, no revision matching.
 * The journey lamp comes from workflow.stage alone; this only marks whether the
 * recorded PR is merged. Unreadable providers, identities or responses stay
 * unknown instead of a guessed state.
 */
export async function readArchivePrStatus(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0],
  params: ArchivePrStatusRequest
): Promise<ArchivePrStatusResult> {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  const { repo } = await resolver.resolve({
    repoId: params.repoId,
    worktreeId: params.worktreeId,
    hostId: params.hostId
  })
  if (params.pr.provider !== 'github' || isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    return { state: 'unknown', reason: '此来源的 PR 状态暂无法读回' }
  }
  const wslDistro = repo.connectionId ? undefined : parseWslPath(repo.path)?.distro
  const localGitOptions = wslDistro ? { wslDistro } : {}
  const ownerRepo = await getOwnerRepo(repo.path, repo.connectionId, localGitOptions)
  if (!ownerRepo) {
    return { state: 'unknown', reason: '未解析项目的 GitHub 来源，无法读取 PR 状态' }
  }
  const identity = githubRepoIdentityKey(ownerRepo)
  if (params.pr.repository !== identity && params.pr.repository !== `${ownerRepo.owner}/${ownerRepo.repo}`) {
    return { state: 'unknown', reason: 'PR 引用与项目真实 GitHub 来源不一致' }
  }
  const ghOptions = {
    ...ghRepoExecOptions(githubRepoContext(repo.path, repo.connectionId, localGitOptions)),
    ...githubHostExecOptions(ownerRepo)
  }
  if (repositoryRateLimitGuard(ownerRepo, 'core', ghOptions).blocked) {
    return { state: 'unknown', reason: 'GitHub 速率限制中，PR 状态暂不可读' }
  }
  try {
    noteRepositoryRateLimitSpend(ownerRepo, 'core', 1, ghOptions)
    const { stdout } = await ghExecFileAsync(
      ['api', `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${params.pr.number}`],
      ghOptions
    )
    const parsed = JSON.parse(stdout) as RestPull
    if (typeof parsed !== 'object' || parsed === null) {
      return { state: 'unknown', reason: 'provider 返回了意外的 PR 形状' }
    }
    const merged = typeof parsed.merged_at === 'string' && parsed.merged_at.length > 0
    const state = merged ? 'merged' : parsed.state === 'closed' ? 'closed' : 'open'
    return {
      state,
      ...(typeof parsed.html_url === 'string' && parsed.html_url ? { url: parsed.html_url } : {}),
      checkedAt: new Date().toISOString()
    }
  } catch (reason) {
    return {
      state: 'unknown',
      reason: reason instanceof Error ? reason.message : String(reason)
    }
  }
}
