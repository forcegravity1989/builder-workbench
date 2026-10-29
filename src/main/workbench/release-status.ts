import { parseWslPath } from '../wsl'
import {
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext
} from '../github/gh-utils'
import { githubHostExecOptions } from '../github/github-api-repository'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from '../github/rate-limit'
import { isCodeHubGitRemote } from '../../shared/codehub'
import type {
  ReleaseStatusRequest,
  ReleaseStatusResult
} from '../../shared/workbench/release-status'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost
} from './workspace-resolver'

type RestRelease = {
  html_url?: unknown
  published_at?: unknown
  assets?: { name?: unknown }[]
}

function isNotFound(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.includes('HTTP 404')
}

/**
 * Thin release status read keyed by the model-recorded tag reference — one
 * `releases/tags/{tag}` read, no tag-list probing, no asset downloads. A
 * recorded tag with no matching Release is a real reading (missing): the
 * release run may have stopped after tagging, or the tag never landed; the
 * board says so instead of guessing. The tag read 404s both when the Release
 * is missing and when the repo itself is unreachable (renamed, deleted, lost
 * private scope), so a 404 probes the repo once before claiming missing —
 * unreadable stays unknown. Published time, Release URL and assets stay
 * provider-computed on every read.
 */
export async function readReleaseStatus(
  runtime: Parameters<typeof nativeWorkbenchWorkspaceHost>[0],
  params: ReleaseStatusRequest
): Promise<ReleaseStatusResult> {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  const { repo } = await resolver.resolve({
    repoId: params.repoId,
    worktreeId: params.worktreeId,
    hostId: params.hostId
  })
  // CodeHub has no verified Release read-back path; an unverified ability is
  // surfaced as unreadable rather than approximated with task reads.
  if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    return { state: 'unknown', reason: '此来源的发布状态暂无法读回' }
  }
  const wslDistro = repo.connectionId ? undefined : parseWslPath(repo.path)?.distro
  const localGitOptions = wslDistro ? { wslDistro } : {}
  const ownerRepo = await getOwnerRepo(repo.path, repo.connectionId, localGitOptions)
  if (!ownerRepo) {
    return { state: 'unknown', reason: '未解析项目的 GitHub 来源，无法读取发布状态' }
  }
  const ghOptions = {
    ...ghRepoExecOptions(githubRepoContext(repo.path, repo.connectionId, localGitOptions)),
    ...githubHostExecOptions(ownerRepo)
  }
  if (repositoryRateLimitGuard(ownerRepo, 'core', ghOptions).blocked) {
    return { state: 'unknown', reason: 'GitHub 速率限制中，发布状态暂不可读' }
  }
  try {
    noteRepositoryRateLimitSpend(ownerRepo, 'core', 1, ghOptions)
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/releases/tags/${encodeURIComponent(
          params.release.tag
        )}`
      ],
      ghOptions
    )
    const parsed = JSON.parse(stdout) as RestRelease
    if (typeof parsed !== 'object' || parsed === null) {
      return { state: 'unknown', reason: 'provider 返回了意外的 Release 形状' }
    }
    const url = typeof parsed.html_url === 'string' && parsed.html_url ? parsed.html_url : null
    const publishedAt =
      typeof parsed.published_at === 'string' && parsed.published_at ? parsed.published_at : null
    const assets = Array.isArray(parsed.assets)
      ? parsed.assets
          .map((asset) => (typeof asset?.name === 'string' ? asset.name : ''))
          .filter(Boolean)
      : []
    if (!url || !publishedAt) {
      return { state: 'unknown', reason: 'provider 返回的 Release 缺少地址或发布时间' }
    }
    return {
      state: 'published',
      publishedAt,
      url,
      assets,
      checkedAt: new Date().toISOString()
    }
  } catch (reason) {
    if (isNotFound(reason)) {
      // A 404 here is ambiguous: the Release may be missing, or the repo may
      // be unreachable (renamed/deleted, lost private scope — GitHub answers
      // 404 for both). Probe the repo once so "missing" is only claimed when
      // the repo itself answers; otherwise this is no data, not a reading.
      try {
        noteRepositoryRateLimitSpend(ownerRepo, 'core', 1, ghOptions)
        await ghExecFileAsync(['api', `repos/${ownerRepo.owner}/${ownerRepo.repo}`], ghOptions)
        return { state: 'missing', checkedAt: new Date().toISOString() }
      } catch (repoReason) {
        return {
          state: 'unknown',
          reason: `发布状态读取失败：仓库不可达（${
            repoReason instanceof Error ? repoReason.message : String(repoReason)
          }）`
        }
      }
    }
    return {
      state: 'unknown',
      reason: `发布状态读取失败：${reason instanceof Error ? reason.message : String(reason)}`
    }
  }
}
