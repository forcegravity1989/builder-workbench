import { useAppStore } from '@/store'
import { getConnectionIdFromState } from '@/lib/connection-owner-resolution'
import { getRuntimeGitHistory } from '@/runtime/runtime-git-status-client'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { codehubApi } from '@/lib/codehub-api'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import {
  getGitHubRuntimeRepoId,
  getGitHubSourceRuntimeTarget
} from '@/lib/github-source-runtime-context'
import type { GitHubWorkItem, ListWorkItemsResult } from '../../../shared/github/work-item-types'
import type { Repo } from '../../../shared/repo-types'
import type { MetricRange } from '../../../shared/workbench/metrics'
import { addCalendarDays, calendarDayStart } from '../../../shared/workbench/metric-windows'
import type { SdlcCommits, SdlcProvider, SdlcSeries, SdlcSnapshot } from './overview-sdlc'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
export async function readSdlcCommits(args: {
  ownerEnvironmentId?: string
  worktreeId: string
  worktreePath: string
  range: MetricRange
  current(): boolean
}): Promise<SdlcSeries<SdlcCommits>> {
  try {
    const context = {
      settings: { activeRuntimeEnvironmentId: args.ownerEnvironmentId ?? null },
      worktreeId: args.worktreeId,
      worktreePath: args.worktreePath,
      connectionId: getConnectionIdFromState(useAppStore.getState(), args.worktreeId) ?? undefined
    }
    const items = new Map<string, { timestamp?: number }>()
    let revision: string | undefined
    let source = '项目主工作树'
    for (let skip = 0; skip < 10_000; skip += 200) {
      if (!args.current()) {
        throw new Error('读取已取消')
      }
      const result = await getRuntimeGitHistory(context, {
        limit: 200,
        skip,
        revision,
        since: calendarDayStart(args.range.since, args.range.timezone)
      })
      revision ??= result.currentRef?.revision
      if (result.currentRef) {
        source = `${result.currentRef.name} · ${revision?.slice(0, 12) ?? ''}`
      }
      for (const item of result.items) {
        if (!Number.isFinite(item.committedAt)) {
          throw new Error('提交时间不可用')
        }
        items.set(item.id, { timestamp: item.committedAt })
      }
      if (!result.hasMore) {
        return {
          kind: 'ready',
          value: {
            since: args.range.since,
            items: [...items.values()],
            hasMore: false,
            readAt: new Date().toISOString(),
            source
          }
        }
      }
      if (!revision || result.items.length !== 200) {
        throw new Error('提交历史分页不完整')
      }
    }
    throw new Error('本窗口超过 10,000 条提交，未取得完整历史')
  } catch (reason) {
    return { kind: 'error', message: message(reason) }
  }
}

type RemoteItem = { key: string; mergedAt?: string | null }
async function remoteItems(
  repo: Repo,
  provider: SdlcProvider,
  kind: 'pr' | 'issue',
  range: MetricRange,
  current: () => boolean
) {
  if (provider === 'github') {
    const context = getTaskPageRepoSourceContext(repo, 'github')
    const target = getGitHubSourceRuntimeTarget(context)
    // Search dates use UTC; widen one day before bucketing in the project's timezone.
    const query =
      kind === 'pr'
        ? `is:pr is:merged merged:${addCalendarDays(range.since, -1)}..${range.until}`
        : 'is:issue is:open'
    const items = new Map<string, RemoteItem>()
    let source = ''
    for (let page = 1; page <= 10; page++) {
      if (!current()) {
        throw new Error('读取已取消')
      }
      const params = { limit: 100, page, query, noCache: true }
      const result =
        target.kind === 'environment'
          ? await callRuntimeRpc<ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>>>(
              target,
              'github.listWorkItems',
              { repo: getGitHubRuntimeRepoId(context, repo.id), ...params },
              { timeoutMs: 60_000 }
            )
          : await window.api.gh.listWorkItems({ repoPath: repo.path, repoId: repo.id, ...params })
      const failure = kind === 'pr' ? result.errors?.prs : result.errors?.issues
      if (failure) {
        throw new Error(failure.message)
      }
      const origin = kind === 'pr' ? result.sources.prs : result.sources.issues
      if (!origin) {
        throw new Error('未识别仓库数据来源')
      }
      const nextSource = `${origin.host ?? 'github.com'}/${origin.owner}/${origin.repo}`
      if (source && source !== nextSource) {
        throw new Error('分页期间数据来源发生变化，请刷新')
      }
      source = nextSource
      for (const item of result.items) {
        items.set(item.id, { key: item.id, mergedAt: item.mergedAt })
      }
      if (result.items.length < 100) {
        return { items: [...items.values()], source }
      }
    }
    throw new Error('查询达到 GitHub 1,000 条上限，无法确认完整数量')
  }
  for (const limit of [100, 500, 2_000, 10_000]) {
    if (!current()) {
      throw new Error('读取已取消')
    }
    const result = await codehubApi.listTasks({
      repoPath: repo.path,
      repoId: repo.id,
      kind: kind === 'pr' ? 'mr' : 'issue',
      state: kind === 'pr' ? 'merged' : 'opened',
      limit
    })
    if (!result.hasMore) {
      return {
        items: result.items.map((item) => ({ key: String(item.iid), mergedAt: item.mergedAt })),
        source: `${result.remote.host}/${result.remote.project}`
      }
    }
  }
  throw new Error('查询达到 10,000 条上限，无法确认完整数量')
}
export function readSdlcRemote(
  repo: Repo,
  provider: SdlcProvider,
  kind: 'pr',
  range: MetricRange,
  current: () => boolean
): Promise<SdlcSeries<SdlcCommits>>
export function readSdlcRemote(
  repo: Repo,
  provider: SdlcProvider,
  kind: 'issue',
  range: MetricRange,
  current: () => boolean
): Promise<SdlcSeries<SdlcSnapshot>>
export async function readSdlcRemote(
  repo: Repo,
  provider: SdlcProvider,
  kind: 'pr' | 'issue',
  range: MetricRange,
  current: () => boolean
): Promise<SdlcSeries<SdlcCommits | SdlcSnapshot>> {
  try {
    const result = await remoteItems(repo, provider, kind, range, current)
    const readAt = new Date().toISOString()
    if (kind === 'issue') {
      return {
        kind: 'ready',
        value: { count: result.items.length, truncated: false, readAt, source: result.source }
      }
    }
    const items = result.items.map((item) => {
      const timestamp = Date.parse(item.mergedAt ?? '')
      if (!Number.isFinite(timestamp)) {
        throw new Error('合入时间缺失，无法统计趋势')
      }
      return { timestamp }
    })
    return {
      kind: 'ready',
      value: { items, hasMore: false, readAt, source: result.source, since: range.since }
    }
  } catch (reason) {
    return { kind: 'error', message: message(reason) }
  }
}
