import { useAppStore } from '@/store'
import { createCodeHubApi } from '@/lib/codehub-api'
import {
  getGitHubRepoSourceSettings,
  getGitHubWorkItemRequestContext,
  listGitHubWorkItemsForRepo
} from '@/store/github/work-item-routing'
import { isCodeHubGitRemote } from '../../../../shared/codehub'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import {
  seedWorkbenchTaskQuery,
  workbenchVersionTaskLabel
} from '../../../../shared/workbench/task-scope'
import { resolveMemberGoalId } from '../../../../shared/workbench/version-membership'
import {
  rememberGitHubIssueSource,
  requireSourceContext,
  repoOnTaskHost,
  type TaskReadHome
} from '../task-reference-repo'
import { createSnapshotCache } from '../snapshot-cache'
import type { CycleTaskReference } from './ports'

type Issue = { provider: 'github' | 'codehub'; repository: string; number: number; title: string }
type IssueRead = { issues: Issue[] | null; busy: boolean; error: string | null }

export const emptyMembershipRead: IssueRead = { issues: null, busy: false, error: null }
const cache = createSnapshotCache(() => emptyMembershipRead)

export function membershipRepo(
  repos: readonly Repo[],
  scope: TaskReadHome | null
): Repo | undefined {
  if (!scope) {
    return undefined
  }
  const matches = repos.filter((repo) => repo.id === scope.repoId && repoOnTaskHost(repo, scope))
  return matches.length === 1 ? matches[0] : undefined
}

export function membershipEntry(repo: Repo, version: string) {
  return cache(
    JSON.stringify([
      getRepoExecutionHostId(repo),
      repo.id,
      repo.path,
      repo.connectionId,
      repo.gitRemoteIdentity,
      repo.upstream,
      repo.issueSourcePreference,
      version
    ])
  )
}

async function queryVersionIssues(repo: Repo, version: string, force: boolean): Promise<Issue[]> {
  const label = workbenchVersionTaskLabel(version)
  if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    if (label.includes(',')) {
      throw new Error('CodeHub 无法精确查询含逗号的版本标签')
    }
    const api = createCodeHubApi(requireSourceContext(repo, 'codehub'))
    const listing = await api.listTasks({
      repoPath: repo.path,
      repoId: repo.id,
      kind: 'issue',
      state: 'all',
      limit: 250,
      labels: [label]
    })
    if (listing.hasMore) {
      throw new Error('CodeHub 返回的版本 Issue 列表不完整')
    }
    const repository = `${listing.remote.host}/${listing.remote.project}`
    if (listing.items.some((item) => !item.labels.includes(label))) {
      throw new Error('CodeHub 返回了与本版标签不符的 Issue，请刷新')
    }
    return listing.items.map((item) => ({
      provider: 'codehub',
      repository,
      number: item.iid,
      title: item.title
    }))
  }

  const state = useAppStore.getState()
  const source = requireSourceContext(repo, 'github')
  const settings = getGitHubRepoSourceSettings(state.settings, repo, source)
  const context = getGitHubWorkItemRequestContext(state, settings, repo.id, repo.path, source)
  const query = seedWorkbenchTaskQuery('is:issue', { version, references: [] })
  const issues = new Map<number, Issue>()
  let repository: string | undefined
  const limit = 100
  for (let page = 1; page <= 10; page++) {
    const listing = await listGitHubWorkItemsForRepo(context, {
      query,
      limit,
      page,
      ...(force ? { noCache: true } : {})
    })
    if (listing.errors?.issues) {
      throw new Error(listing.errors.issues.message)
    }
    const resolved = listing.sources.issues
    if (!resolved) {
      throw new Error('GitHub 未能解析本版 Issue 的来源仓库')
    }
    const name = `${resolved.host ?? 'github.com'}/${resolved.owner}/${resolved.repo}`
    if (repository && repository !== name) {
      throw new Error('GitHub 版本 Issue 查询期间切换了来源仓库')
    }
    repository = name
    rememberGitHubIssueSource(repo, name, resolved)
    for (const item of listing.items) {
      if (item.type !== 'issue' || !item.labels.includes(label)) {
        throw new Error('GitHub 返回了与本版标签不符的 Issue，请刷新')
      }
      if (issues.has(item.number)) {
        throw new Error('GitHub 版本 Issue 分页结果发生变化，请刷新')
      }
      issues.set(item.number, {
        provider: 'github',
        repository,
        number: item.number,
        title: item.title
      })
    }
    if (listing.items.length < limit) {
      return [...issues.values()]
    }
  }
  throw new Error('GitHub 版本 Issue 已达到搜索上限，无法确认完整列表')
}

export function refreshVersionIssues(repo: Repo, version: string, force = false): Promise<void> {
  const entry = membershipEntry(repo, version)
  if (entry.pending) {
    return force
      ? entry.pending.then(() => refreshVersionIssues(repo, version, true))
      : entry.pending
  }
  entry.publish({ ...entry.read(), busy: true })
  entry.pending = queryVersionIssues(repo, version, force)
    .then(
      (issues) => entry.publish({ issues, busy: false, error: null }),
      (reason) =>
        entry.publish({
          issues: null,
          busy: false,
          error: reason instanceof Error ? reason.message : String(reason)
        })
    )
    .finally(() => {
      entry.pending = null
    })
  return entry.pending
}

export function versionIssueReferences(
  issues: readonly Issue[],
  version: string,
  goals: readonly { goalId: string }[]
): CycleTaskReference[] {
  const goalIds = new Set(goals.map((goal) => goal.goalId))
  return issues
    .map(({ title, ...issue }) => {
      const goalId = resolveMemberGoalId(title, version, goalIds)
      return { ...issue, kind: 'issue' as const, ...(goalId ? { goalId } : {}) }
    })
    .sort((a, b) => a.number - b.number)
}

export async function readVersionMembership(
  scope: TaskReadHome,
  plan: { version: string; goals: readonly { goalId: string }[] },
  force = false
): Promise<CycleTaskReference[]> {
  const repo = membershipRepo(useAppStore.getState().repos, scope)
  if (!repo) {
    throw new Error('未找到本版所属仓库')
  }
  await refreshVersionIssues(repo, plan.version, force)
  const { issues, error } = membershipEntry(repo, plan.version).read()
  if (!issues) {
    throw new Error(error ?? '版本 Issue 未读到')
  }
  return versionIssueReferences(issues, plan.version, plan.goals)
}
