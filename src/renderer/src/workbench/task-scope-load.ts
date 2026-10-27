import { useAppStore } from '@/store'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { sortWorkItemsByNumber } from '../../../shared/work-items'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import type { Repo } from '../../../shared/repo-types'
import {
  WorkbenchTaskScopeSchema,
  type WorkbenchTaskScope
} from '../../../shared/workbench/task-scope'
import type { CycleTaskReference } from './version-cycle/ports'
import { resolveReferenceRepo } from './task-reference-repo'
import { nativeTaskReferenceReader } from './native-task-port'
import type { TaskReferenceValue } from './task-reference-reader'
import { isCodeHubGitRemote } from '../../../shared/codehub'

export type TaskScopeMissingRow = {
  provider: string
  repository: string
  number: number
  reason: string
}
export type TaskScopeLoadResult = {
  viewProvider: 'github' | 'codehub'
  githubItems: GitHubWorkItem[]
  codehubItems: CodeHubTaskItem[]
  missing: TaskScopeMissingRow[]
}
type Home = { repoId: string; hostId: ExecutionHostId }

function viewProviderFor(references: readonly { provider: string }[]): 'github' | 'codehub' {
  return references.some((reference) => reference.provider === 'github') ||
    !references.some((reference) => reference.provider === 'codehub')
    ? 'github'
    : 'codehub'
}
function scopeReferences(scope: WorkbenchTaskScope, home: Home) {
  const deps = { repos: () => useAppStore.getState().repos }
  const seen = new Set<string>()
  return scope.references.filter((reference) => {
    const repo = resolveReferenceRepo(deps, home, reference)
    const key = JSON.stringify([
      reference.provider,
      repo?.id ?? reference.repository,
      reference.number
    ])
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
function projectScope(
  references: CycleTaskReference[],
  values: TaskReferenceValue[]
): TaskScopeLoadResult {
  const viewProvider = viewProviderFor(references)
  const githubItems: GitHubWorkItem[] = []
  const codehubItems: CodeHubTaskItem[] = []
  const missing: TaskScopeMissingRow[] = []
  let index = 0
  for (const reference of references) {
    let reason: string | null = null
    if (reference.provider !== 'github' && reference.provider !== 'codehub') {
      reason = `provider ${reference.provider} 尚未接入 Workbench 任务范围读取`
    } else if (reference.provider !== viewProvider) {
      reason = `属 ${reference.provider} 来源，当前 ${viewProvider} 任务视图未展开`
    } else {
      const value = values[index++]
      if (value?.kind === 'github') {
        githubItems.push(value.item)
      } else if (value?.kind === 'codehub') {
        codehubItems.push(value.item)
      } else {
        reason = value?.error ?? '尚未读取'
      }
    }
    if (reason) {
      missing.push({ ...reference, reason })
    }
  }
  missing.sort((a, b) => a.number - b.number || a.repository.localeCompare(b.repository))
  return { viewProvider, githubItems: sortWorkItemsByNumber(githubItems), codehubItems, missing }
}
function visibleReferences(references: CycleTaskReference[]) {
  const provider = viewProviderFor(references)
  return references.filter((reference) => reference.provider === provider)
}

/** Display uses previous native rows; every load still checks the source. */
export function cachedWorkbenchTaskScope(
  scope: WorkbenchTaskScope,
  home: Home
): TaskScopeLoadResult | null {
  const references = scopeReferences(scope, home)
  const visible = visibleReferences(references)
  const values = nativeTaskReferenceReader.cached(home, visible)
  return values || !visible.length ? projectScope(references, values ?? []) : null
}
export async function loadWorkbenchTaskScope(
  scope: WorkbenchTaskScope,
  home: Home,
  force = false
): Promise<TaskScopeLoadResult> {
  const references = scopeReferences(scope, home)
  const values = await nativeTaskReferenceReader.read(home, visibleReferences(references), force)
  return projectScope(references, values)
}

/**
 * 侧栏「任务」/目标目录行的打开入口：范围随 TaskPageData 带入同一个原生任务屏，
 * 不新建页面或任务正本。references 由调用方从计划材料完整给出（含目标过滤）。
 */
export function openVersionTasksPage(args: {
  version: string
  goal?: { goalId: string; label?: string } | null
  references: readonly CycleTaskReference[]
  homeRepoId?: string | null
}): void {
  const scope: WorkbenchTaskScope = {
    version: args.version,
    goalId: args.goal?.goalId ?? null,
    goalLabel: args.goal?.label ?? null,
    references: args.references.map((reference) => ({
      provider: reference.provider,
      repository: reference.repository,
      number: reference.number,
      ...(reference.goalId ? { goalId: reference.goalId } : {})
    }))
  }
  const homeRepo = useAppStore.getState().repos.find((repo) => repo.id === args.homeRepoId)
  const provider = scope.references.length
    ? viewProviderFor(scope.references)
    : isCodeHubGitRemote(homeRepo?.gitRemoteIdentity)
      ? 'codehub'
      : 'github'
  useAppStore.getState().openTaskPage({
    taskSource: provider,
    ...(args.homeRepoId ? { preselectedRepoId: args.homeRepoId } : {}),
    // 入口自证契约：范围对象过共享 schema 后才进 store（防拼装回归）。
    workbenchTaskScope: WorkbenchTaskScopeSchema.parse(scope)
  })
}

/** 范围行的原生宿主解析入口（与 use-cycle-workspace-target 同口径取主仓与宿主）。 */
type HomeSource = { repos: readonly Repo[]; activeRepoId: string | null }
function versionTaskScopeHome(preselectedRepoId?: string, source?: HomeSource): Home | null {
  const state = source ?? useAppStore.getState()
  const repoId = preselectedRepoId ?? state.activeRepoId ?? state.repos[0]?.id ?? null
  const repo = state.repos.find((item) => item.id === repoId)
  if (!repo) {
    return null
  }
  return { repoId: repo.id, hostId: getRepoExecutionHostId(repo) }
}

/** 宿主解析必须成功才可装载范围；失败文案住 BW 模块（原生文件不引新词条）。 */
export function requireVersionTaskScopeHome(
  preselectedRepoId?: string,
  source?: HomeSource
): {
  repoId: string
  hostId: ExecutionHostId
} {
  const home = versionTaskScopeHome(preselectedRepoId, source)
  if (!home) {
    throw new Error('无法解析当前项目的任务范围宿主')
  }
  return home
}
