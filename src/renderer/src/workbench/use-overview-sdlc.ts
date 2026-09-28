import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { IssueInfo } from '../../../shared/github/pull-request-types'
import type { Repo } from '../../../shared/repo-types'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import {
  SDLC_COMMIT_LIMIT,
  SDLC_ISSUE_LIMIT,
  sdlcProviderOf,
  type SdlcCommits,
  type SdlcProvider,
  type SdlcSeries,
  type SdlcSnapshot
} from './overview-sdlc'

function reasonText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/** Commits come from the main worktree's reachable history through the native git channel. */
async function readCommits(args: {
  ownerEnvironmentId: string | undefined
  repoId: string
  worktreeId: string
  worktreePath: string
}): Promise<SdlcSeries<SdlcCommits>> {
  try {
    const state = useAppStore.getState()
    const result = await getRuntimeGitHistory(
      {
        settings: {
          activeRuntimeEnvironmentId: args.ownerEnvironmentId ?? null
        },
        worktreeId: args.worktreeId,
        worktreePath: args.worktreePath,
        connectionId: getConnectionIdFromState(state, args.worktreeId) ?? undefined
      },
      { limit: SDLC_COMMIT_LIMIT }
    )
    return {
      kind: 'ready',
      value: {
        items: result.items.map((item) => ({ timestamp: item.timestamp })),
        hasMore: result.hasMore,
        readAt: new Date().toISOString()
      }
    }
  } catch (reason) {
    return { kind: 'error', message: reasonText(reason) }
  }
}

/**
 * Open issues are a point-in-time stock through the same provider layer the Tasks
 * page uses: GitHub answers open issues with PRs already excluded; CodeHub lists
 * opened issues. A full page or hasMore is flagged truncation, never a total.
 */
async function readOpenIssues(
  repo: Repo,
  provider: SdlcProvider
): Promise<SdlcSeries<SdlcSnapshot>> {
  try {
    if (provider === 'github') {
      const sourceContext = getTaskPageRepoSourceContext(repo, 'github')
      const target = getGitHubSourceRuntimeTarget(sourceContext)
      const items =
        target.kind === 'environment'
          ? await callRuntimeRpc<IssueInfo[]>(
              target,
              'github.listIssues',
              { repo: getGitHubRuntimeRepoId(sourceContext, repo.id), limit: SDLC_ISSUE_LIMIT },
              { timeoutMs: 30_000 }
            )
          : await window.api.gh.listIssues({
              repoPath: repo.path,
              repoId: repo.id,
              limit: SDLC_ISSUE_LIMIT
            })
      return {
        kind: 'ready',
        value: {
          count: items.length,
          truncated: items.length >= SDLC_ISSUE_LIMIT,
          readAt: new Date().toISOString()
        }
      }
    }
    const result = await codehubApi.listTasks({
      repoPath: repo.path,
      repoId: repo.id,
      kind: 'issue',
      state: 'opened',
      limit: SDLC_ISSUE_LIMIT
    })
    return {
      kind: 'ready',
      value: {
        count: result.items.length,
        truncated: result.hasMore,
        readAt: new Date().toISOString()
      }
    }
  } catch (reason) {
    return { kind: 'error', message: reasonText(reason) }
  }
}

export type OverviewSdlcState = {
  provider: SdlcProvider | null
  commits: SdlcSeries<SdlcCommits> | null
  issues: SdlcSeries<SdlcSnapshot> | null
  busy: boolean
  refresh(): Promise<void>
}

/**
 * Independent SDLC reads for the overview's project-metric zone: each series
 * succeeds or fails on its own, one refresh re-reads both, and a stale response
 * never overwrites a newer one. Merged PRs have no honest merge-time channel and
 * are deliberately not fetched — the zone says so instead of inferring history.
 */
export function useOverviewSdlc(args: {
  repo: Repo | null
  baseScope: NativeWorkspaceScope | null
  baseWorktreeId: string | null
  baseWorktreePath: string | null
}): OverviewSdlcState {
  const { repo, baseScope, baseWorktreeId, baseWorktreePath } = args
  const provider = useMemo(() => sdlcProviderOf(repo), [repo])
  const [commits, setCommits] = useState<SdlcSeries<SdlcCommits> | null>(null)
  const [issues, setIssues] = useState<SdlcSeries<SdlcSnapshot> | null>(null)
  const [busy, setBusy] = useState(false)
  const epoch = useRef(0)
  const repoPath = repo?.path ?? null
  const repoId = repo?.id ?? null
  const ownerEnvironmentId = baseScope?.runtimeOwnerEnvironmentId
  const hostId = baseScope?.hostId ?? null

  const load = useCallback(async () => {
    if (!repoId || !repoPath || !baseWorktreeId || !baseWorktreePath || !hostId) {
      setCommits(null)
      setIssues(null)
      return
    }
    const sequence = ++epoch.current
    setBusy(true)
    try {
      const [commitResult, issueResult] = await Promise.all([
        readCommits({
          ownerEnvironmentId,
          repoId,
          worktreeId: baseWorktreeId,
          worktreePath: baseWorktreePath
        }),
        provider && repo ? readOpenIssues(repo, provider) : Promise.resolve(null)
      ])
      if (sequence !== epoch.current) {
        return
      }
      setCommits(commitResult)
      setIssues(issueResult)
    } finally {
      if (sequence === epoch.current) {
        setBusy(false)
      }
    }
  }, [
    repoId,
    repoPath,
    repo,
    provider,
    baseWorktreeId,
    baseWorktreePath,
    hostId,
    ownerEnvironmentId
  ])

  useEffect(() => {
    void load()
  }, [load])

  return { provider, commits, issues, busy, refresh: load }
}
