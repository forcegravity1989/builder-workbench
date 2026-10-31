import { parseWslPath } from '../wsl'
import {
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext
} from '../github/gh-utils'
import { githubHostExecOptions } from '../github/github-api-repository'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from '../github/rate-limit'
import { isCodeHubGitRemote, parseCodeHubRemote, type CodeHubRemote } from '../../shared/codehub'
import type { CodeHubTaskDetail } from '../../shared/codehub-tasks'
import { viewCodeHubTask } from '../codehub/mutations'
import type {
  ArchivePrStatusRequest,
  ArchivePrStatusResult
} from '../../shared/workbench/archive-pr-status'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost
} from './workspace-resolver'

type RestPull = { state?: unknown; merged_at?: unknown; html_url?: unknown }

const CODEHUB_ARCHIVE_CACHE_TTL_MS = 30_000
const codeHubArchiveCache = new Map<string, { expiresAt: number; result: ArchivePrStatusResult }>()
const codeHubArchiveReads = new Map<string, Promise<ArchivePrStatusResult>>()

function normalizedCodeHubIdentity(value: string): string {
  return value
    .trim()
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
}

function normalizedGithubIdentity(value: string): { host: string; slug: string } | null {
  const normalized = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^git@github\.com:/i, 'github.com/')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length < 2) {
    return null
  }
  const qualified = parts.length >= 3 && (parts[0] === 'github.com' || parts[0].includes('.'))
  return {
    host: qualified ? parts[0] : 'github.com',
    slug: (qualified ? parts.slice(1) : parts).join('/')
  }
}

/** @internal — accepts the host-qualified forms written by older materials. */
export function githubRepositoryMatches(
  repository: string,
  ownerRepo: { owner: string; repo: string; host?: string }
): boolean {
  const recorded = normalizedGithubIdentity(repository)
  if (!recorded) {
    return false
  }
  return (
    recorded.slug === `${ownerRepo.owner}/${ownerRepo.repo}`.toLowerCase() &&
    recorded.host === (ownerRepo.host?.trim().toLowerCase() || 'github.com')
  )
}

/** @internal — compares the recorded provider reference to the registered remote. */
export function codeHubRepositoryMatches(repository: string, remote: CodeHubRemote): boolean {
  const recorded = normalizedCodeHubIdentity(repository)
  const remoteIdentity = `${remote.host}/${remote.project}`.toLowerCase()
  if (recorded === remoteIdentity || recorded === remote.project.toLowerCase()) {
    return true
  }
  const parsed = parseCodeHubRemote(repository)
  return parsed !== null && `${parsed.host}/${parsed.project}`.toLowerCase() === remoteIdentity
}

/** @internal — CodeHub CLI state is deliberately narrower than its free-form detail state. */
export function mapCodeHubArchiveState(
  detail: Pick<CodeHubTaskDetail, 'state'>
): 'merged' | 'closed' | 'open' | null {
  const state = detail.state.trim().toLowerCase()
  if (state === 'merged') {
    return 'merged'
  }
  if (state === 'closed') {
    return 'closed'
  }
  if (state === 'open' || state === 'opened') {
    return 'open'
  }
  return null
}

export function codeHubArchiveUrl(
  remote: CodeHubRemote,
  number: number,
  recorded?: string
): string {
  const fallback = `https://${remote.host}/${remote.project
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')}/-/merge_requests/${number}`
  return recorded?.trim() || fallback
}

function codeHubArchiveCacheKey(remote: CodeHubRemote, number: number): string {
  return `${remote.host.toLowerCase()}/${remote.project.toLowerCase()}!${number}`
}

async function readCodeHubArchiveStatus(args: {
  remote: CodeHubRemote
  number: number
  execOptions: { cwd?: string; wslDistro?: string }
  force?: boolean
}): Promise<ArchivePrStatusResult> {
  const key = codeHubArchiveCacheKey(args.remote, args.number)
  const cached = codeHubArchiveCache.get(key)
  if (!args.force && cached && cached.expiresAt > Date.now()) {
    return cached.result
  }
  const inFlight = codeHubArchiveReads.get(key)
  if (inFlight) {
    return inFlight
  }
  const read: Promise<ArchivePrStatusResult> = (async () => {
    try {
      const detail = await viewCodeHubTask({
        remote: args.remote,
        execOptions: args.execOptions,
        kind: 'mr',
        iid: args.number
      })
      const state = mapCodeHubArchiveState(detail)
      if (!state) {
        return {
          state: 'unknown',
          reason: `CodeHub 返回了未识别的 MR 状态：${detail.state}`,
          url: codeHubArchiveUrl(args.remote, args.number, detail.url ?? undefined)
        }
      }
      return {
        state,
        url: codeHubArchiveUrl(args.remote, args.number, detail.url ?? undefined),
        checkedAt: new Date().toISOString(),
        ...(state === 'merged' && detail.mergedAt && Number.isFinite(Date.parse(detail.mergedAt))
          ? { mergedAt: new Date(detail.mergedAt).toISOString() }
          : {})
      }
    } catch (reason) {
      return {
        state: 'unknown',
        url: codeHubArchiveUrl(args.remote, args.number),
        reason: `CodeHub MR 状态读取失败：${reason instanceof Error ? reason.message : String(reason)}`
      }
    }
  })()
  codeHubArchiveReads.set(key, read)
  try {
    const result = await read
    codeHubArchiveCache.set(key, { expiresAt: Date.now() + CODEHUB_ARCHIVE_CACHE_TTL_MS, result })
    return result
  } finally {
    codeHubArchiveReads.delete(key)
  }
}

/**
 * Thin archive PR status: one `pulls/{n}` read keyed by the model-recorded
 * reference — no byte proof, no branch-name discovery, no revision matching.
 * This only marks whether the recorded PR is merged; the boards render it as
 * text and derive no lamp from it (journey lamps are retired). Unreadable
 * providers, identities or responses stay unknown instead of a guessed state.
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
  const codeHubRemote = isCodeHubGitRemote(repo.gitRemoteIdentity)
    ? (parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
      parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey))
    : null
  if (params.pr.provider === 'codehub' && codeHubRemote) {
    if (!codeHubRepositoryMatches(params.pr.repository, codeHubRemote)) {
      return { state: 'unknown', reason: 'PR 引用与项目真实 CodeHub 来源不一致' }
    }
    const wslDistro = repo.connectionId ? undefined : parseWslPath(repo.path)?.distro
    return readCodeHubArchiveStatus({
      force: params.force,
      remote: codeHubRemote,
      number: params.pr.number,
      execOptions: {
        ...(repo.connectionId ? {} : { cwd: repo.path }),
        ...(wslDistro ? { wslDistro } : {})
      }
    })
  }
  if (params.pr.provider !== 'github' || codeHubRemote) {
    return { state: 'unknown', reason: '此来源的 PR 状态暂无法读回' }
  }
  const wslDistro = repo.connectionId ? undefined : parseWslPath(repo.path)?.distro
  const localGitOptions = wslDistro ? { wslDistro } : {}
  const ownerRepo = await getOwnerRepo(repo.path, repo.connectionId, localGitOptions)
  if (!ownerRepo) {
    return { state: 'unknown', reason: '未解析项目的 GitHub 来源，无法读取 PR 状态' }
  }
  if (!githubRepositoryMatches(params.pr.repository, ownerRepo)) {
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
    if (!merged && parsed.state !== 'open' && parsed.state !== 'closed') {
      return { state: 'unknown', reason: 'provider 返回了未识别的 PR 状态' }
    }
    const state: ArchivePrStatusResult['state'] = merged
      ? 'merged'
      : parsed.state === 'open'
        ? 'open'
        : 'closed'
    return {
      state,
      ...(typeof parsed.html_url === 'string' && parsed.html_url ? { url: parsed.html_url } : {}),
      checkedAt: new Date().toISOString(),
      ...(merged &&
      typeof parsed.merged_at === 'string' &&
      Number.isFinite(Date.parse(parsed.merged_at))
        ? { mergedAt: new Date(parsed.merged_at).toISOString() }
        : {})
    }
  } catch (reason) {
    return {
      state: 'unknown',
      url: `https://${ownerRepo.host ?? 'github.com'}/${ownerRepo.owner}/${ownerRepo.repo}/pull/${params.pr.number}`,
      reason: `PR 状态读取失败：${reason instanceof Error ? reason.message : String(reason)}`
    }
  }
}
