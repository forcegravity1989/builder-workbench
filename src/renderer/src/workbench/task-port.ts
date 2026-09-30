import { useAppStore } from '@/store'
import { codehubApi } from '@/lib/codehub-api'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { parseCodeHubRemote } from '../../../shared/codehub'
import type { CodeHubTaskDetail, CodeHubTaskItem } from '../../../shared/codehub-tasks'
import { normalizeGitRemoteUrl } from '../../../shared/git-remote-identity'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { Repo } from '../../../shared/repo-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { AppState } from '@/store/types'
import type {
  CycleScope,
  CycleTaskRead,
  CycleTaskReference,
  CycleTaskSnapshot,
  TaskOrigin,
  TaskPort
} from './version-cycle/ports'

/** Reads/writes go through the same native provider layer the Tasks page uses;
 * BW keeps references and point-in-time snapshots only — never issue bodies or
 * a second source of truth for work state. */
export type TaskPortDeps = {
  repos(): readonly Repo[]
  lookupGitHubWorkItem(args: {
    repoPath: string
    repoId: string
    sourceContext?: TaskSourceContext | null
    number: number
  }): Promise<Omit<GitHubWorkItem, 'repoId'> | null>
  viewCodeHubTask(args: {
    repoPath: string
    repoId?: string
    kind: 'issue' | 'mr'
    iid: number
  }): Promise<CodeHubTaskDetail>
  openTaskPage: AppState['openTaskPage']
  now(): string
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function exactIdentityMatch(repo: Repo, repository: string): boolean {
  const identity = repo.gitRemoteIdentity
  const candidates = [
    identity?.canonicalKey,
    identity?.remoteUrl ? (normalizeGitRemoteUrl(identity.remoteUrl) ?? identity.remoteUrl) : null,
    repo.id,
    repo.path
  ]
  return candidates.some((candidate) => candidate === repository)
}

/** CodeHub prefers its own project path, falling back to identity-key equality. */
function codeHubIdentityMatches(repo: Repo, repository: string): boolean {
  const remote =
    parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
    parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
  if (!remote) {
    return false
  }
  const wanted = repository.trim().replace(/\.git$/i, '').replace(/^\/+/, '')
  return wanted === remote.project || wanted === `${remote.host}/${remote.project}`
}

function repoMatchesReference(repo: Repo, reference: CycleTaskReference): boolean {
  if (reference.provider === 'codehub') {
    return codeHubIdentityMatches(repo, reference.repository) || exactIdentityMatch(repo, reference.repository)
  }
  if (reference.provider === 'github') {
    if (
      parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ||
      parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
    ) {
      return false
    }
    return exactIdentityMatch(repo, reference.repository)
  }
  return exactIdentityMatch(repo, reference.repository)
}

/** Resolve the registered repo a material reference points at; scope's own repo/host wins on ties. */
export function resolveReferenceRepo(
  deps: Pick<TaskPortDeps, 'repos'>,
  scope: CycleScope,
  reference: CycleTaskReference
): Repo | null {
  const wanted = normalizeGitRemoteUrl(reference.repository) ?? reference.repository
  const matches = deps.repos().filter((repo) => repo.path && repoMatchesReference(repo, { ...reference, repository: wanted }))
  if (matches.length === 0) {
    return null
  }
  return (
    matches.find((repo) => repo.id === scope.repoId) ??
    matches.find((repo) => getRepoExecutionHostId(repo) === scope.hostId) ??
    matches[0]!
  )
}

function requireSourceContext(repo: Repo, provider: 'github' | 'codehub'): TaskSourceContext {
  const sourceContext = getTaskPageRepoSourceContext(repo, provider)
  if (!sourceContext) {
    throw new Error(`无法解析 ${provider} 任务来源上下文`)
  }
  return sourceContext
}

/** CodeHub references carry no issue/MR kind; read as issue first, then MR. */
async function viewCodeHubTaskByIid(
  deps: Pick<TaskPortDeps, 'viewCodeHubTask'>,
  repo: Repo,
  iid: number
): Promise<{ kind: 'issue' | 'mr'; detail: CodeHubTaskDetail }> {
  const args = { repoPath: repo.path, repoId: repo.id, iid }
  try {
    return { kind: 'issue', detail: await deps.viewCodeHubTask({ ...args, kind: 'issue' }) }
  } catch (issueError) {
    try {
      return { kind: 'mr', detail: await deps.viewCodeHubTask({ ...args, kind: 'mr' }) }
    } catch (mrError) {
      throw new Error(
        `Issue 读取失败：${errorMessage(issueError)}；MR 读取失败：${errorMessage(mrError)}`
      )
    }
  }
}

/** Same web-URL shape main/codehub/work-items.ts itemUrl falls back to; only used when the CLI omits the link. */
function codehubWebUrl(repo: Repo, kind: 'issue' | 'mr', iid: number): string | null {
  const remote =
    parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
    parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
  if (!remote) {
    return null
  }
  const project = remote.project
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://${remote.host}/${project}/-/${kind === 'mr' ? 'merge_requests' : 'issues'}/${iid}`
}

async function readReference(
  deps: TaskPortDeps,
  scope: CycleScope,
  reference: CycleTaskReference
): Promise<CycleTaskSnapshot> {
  const repo = resolveReferenceRepo(deps, scope, reference)
  if (!repo) {
    throw new Error(`未在已登记项目中找到引用仓库 ${reference.repository}`)
  }
  if (reference.provider === 'github') {
    const source = requireSourceContext(repo, 'github')
    const item = await deps.lookupGitHubWorkItem({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext: source,
      number: reference.number
    })
    if (!item) {
      throw new Error(`GitHub 未返回编号 ${reference.number} 的工作项`)
    }
    return {
      reference,
      source,
      iid: item.number,
      title: item.title,
      state: item.state,
      url: item.url,
      readAt: deps.now()
    }
  }
  if (reference.provider === 'codehub') {
    const source = requireSourceContext(repo, 'codehub')
    const { kind, detail } = await viewCodeHubTaskByIid(deps, repo, reference.number)
    const url = detail.url ?? codehubWebUrl(repo, kind, detail.iid)
    if (!url) {
      throw new Error('CodeHub 未返回该任务的链接')
    }
    return {
      reference,
      source,
      iid: detail.iid,
      title: detail.title,
      state: detail.state,
      url,
      readAt: deps.now()
    }
  }
  throw new Error(`provider ${reference.provider} 尚未接入 Workbench 任务读取`)
}

function codehubStateOf(state: string): CodeHubTaskItem['state'] {
  const raw = state.toLowerCase()
  return raw === 'merged' ? 'merged' : raw === 'closed' ? 'closed' : 'opened'
}

async function openDetail(
  deps: TaskPortDeps,
  task: CycleTaskSnapshot,
  origin: TaskOrigin
): Promise<void> {
  const repo = resolveReferenceRepo(deps, origin, task.reference)
  if (!repo) {
    throw new Error(`未在已登记项目中找到引用仓库 ${task.reference.repository}`)
  }
  // Why: returnToPreviousView keeps the BW screen as the Back target; the BW
  // container restores version/draft/scroll from its own persisted view state.
  const options = {
    recordTasksInteraction: false,
    returnToPreviousView: true
  }
  if (task.reference.provider === 'github') {
    const sourceContext = requireSourceContext(repo, 'github')
    const item = await deps.lookupGitHubWorkItem({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext,
      number: task.iid
    })
    if (!item) {
      throw new Error(`GitHub 未返回编号 ${task.iid} 的工作项，无法打开详情`)
    }
    deps.openTaskPage(
      {
        taskSource: 'github',
        preselectedRepoId: repo.id,
        openGitHubWorkItem: { ...item, repoId: repo.id },
        openGitHubSourceContext: sourceContext
      },
      options
    )
    return
  }
  if (task.reference.provider === 'codehub') {
    const { kind, detail } = await viewCodeHubTaskByIid(deps, repo, task.iid)
    const remote =
      parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
      parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
    const item: CodeHubTaskItem = {
      type: kind,
      iid: detail.iid,
      title: detail.title,
      state: codehubStateOf(detail.state),
      url: detail.url ?? task.url,
      author: detail.author,
      assignees: detail.assignees,
      reviewers: detail.reviewers,
      labels: detail.labels,
      sourceBranch: detail.sourceBranch,
      targetBranch: detail.targetBranch,
      // Why: viewTask carries no updated timestamp; leave empty rather than pass readAt off as one.
      updatedAt: '',
      repoId: repo.id,
      repoPath: repo.path,
      ...(remote ? { host: remote.host, project: remote.project } : {})
    }
    deps.openTaskPage(
      {
        taskSource: 'codehub',
        preselectedRepoId: repo.id,
        openCodeHubTask: item,
        openCodeHubSourceContext: requireSourceContext(repo, 'codehub')
      },
      options
    )
    return
  }
  throw new Error(`provider ${task.reference.provider} 尚未接入 Workbench 详情打开`)
}

export function createTaskPort(deps: TaskPortDeps): TaskPort {
  // Why: native providers own caching (Orca Tasks cache / codehub CLI); both BW
  // entry points re-read through the same layer, so listVersion and refresh share one reader.
  async function readAll(
    scope: CycleScope,
    references: readonly CycleTaskReference[]
  ): Promise<CycleTaskRead[]> {
    return Promise.all(
      references.map(async (reference) => {
        try {
          return {
            kind: 'ready' as const,
            reference,
            task: await readReference(deps, scope, reference)
          }
        } catch (reason) {
          return {
            kind: 'unavailable' as const,
            reference,
            error: errorMessage(reason),
            readAt: deps.now()
          }
        }
      })
    )
  }
  return {
    listVersion: readAll,
    refresh: readAll,
    openDetail: (task, origin) => openDetail(deps, task, origin)
  }
}

export function nativeTaskPort(): TaskPort {
  return createTaskPort({
    repos: () => useAppStore.getState().repos,
    lookupGitHubWorkItem: (args) => lookupGitHubWorkItemForSource(args),
    viewCodeHubTask: (args) => codehubApi.viewTask(args),
    openTaskPage: (data, options) => useAppStore.getState().openTaskPage(data, options),
    now: () => new Date().toISOString()
  })
}
