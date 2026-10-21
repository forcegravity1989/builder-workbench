import { useAppStore } from '@/store'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { codehubApi } from '@/lib/codehub-api'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { sortWorkItemsByNumber } from '../../../shared/work-items'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import type { WorkbenchTaskScope } from '../../../shared/workbench/task-scope'
import type { CycleTaskReference } from './version-cycle/ports'
import { codeHubTaskItemFromDetail } from './codehub-task-item'
import { resolveReferenceRepo, viewCodeHubTaskByIid } from './task-port'

/**
 * G2 任务屏范围装载（P4）：以计划材料的完整任务引用集为范围，经原生 provider
 * 逐条读取（GitHub 单条查询 / CodeHub viewTask），产出可直接进原生列表的行与
 * 「无法读取/未展开」的缺数据行——缺数据保留位置、数量与原因，不静默丢弃。
 * 读取失败如实缺席，不装绿；本模块不建任何任务正本或第二缓存。
 */

export type TaskScopeMissingRow = {
  provider: string
  repository: string
  number: number
  reason: string
}

export type TaskScopeLoadResult = {
  /** 本视图主来源：github 优先（BW 壳任务屏一次呈现一个来源）。 */
  viewProvider: 'github' | 'codehub'
  githubItems: GitHubWorkItem[]
  codehubItems: CodeHubTaskItem[]
  missing: TaskScopeMissingRow[]
}

const SCOPE_READ_CONCURRENCY = 6

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  for (let start = 0; start < items.length; start += limit) {
    await Promise.all(items.slice(start, start + limit).map(run))
  }
}

export async function loadWorkbenchTaskScope(
  scope: WorkbenchTaskScope,
  home: { repoId: string; hostId: ExecutionHostId }
): Promise<TaskScopeLoadResult> {
  const deps = { repos: () => useAppStore.getState().repos }
  const missing: TaskScopeMissingRow[] = []
  const githubItems: GitHubWorkItem[] = []
  const codehubItems: CodeHubTaskItem[] = []
  const githubRefs = scope.references.filter((reference) => reference.provider === 'github')
  const codehubRefs = scope.references.filter((reference) => reference.provider === 'codehub')
  for (const reference of scope.references) {
    if (reference.provider !== 'github' && reference.provider !== 'codehub') {
      missing.push({
        provider: reference.provider,
        repository: reference.repository,
        number: reference.number,
        reason: `provider ${reference.provider} 尚未接入 Workbench 任务范围读取`
      })
    }
  }
  const viewProvider: 'github' | 'codehub' =
    githubRefs.length > 0 || codehubRefs.length === 0 ? 'github' : 'codehub'
  // 另一来源的引用如实计数、不展开：任务屏一次呈现一个来源，不静默丢弃。
  for (const reference of viewProvider === 'github' ? codehubRefs : githubRefs) {
    missing.push({
      provider: reference.provider,
      repository: reference.repository,
      number: reference.number,
      reason: `属 ${reference.provider} 来源，当前 ${viewProvider} 任务视图未展开`
    })
  }
  const viewRefs = viewProvider === 'github' ? githubRefs : codehubRefs
  await mapPool(viewRefs, SCOPE_READ_CONCURRENCY, async (reference) => {
    const miss = (reason: string) => {
      missing.push({
        provider: reference.provider,
        repository: reference.repository,
        number: reference.number,
        reason
      })
    }
    const repo = resolveReferenceRepo(deps, home, reference)
    if (!repo) {
      miss(`未在已登记项目中找到引用仓库 ${reference.repository}`)
      return
    }
    if (viewProvider === 'github') {
      const sourceContext = getTaskPageRepoSourceContext(repo, 'github')
      if (!sourceContext) {
        miss('无法解析 GitHub 任务来源上下文')
        return
      }
      try {
        const item = await lookupGitHubWorkItemForSource({
          repoPath: repo.path,
          repoId: repo.id,
          sourceContext,
          number: reference.number
        })
        if (!item) {
          miss(`GitHub 未返回编号 ${reference.number} 的工作项`)
          return
        }
        githubItems.push(item)
      } catch (reason) {
        miss(`读取失败：${errorMessage(reason)}`)
      }
      return
    }
    try {
      const { kind, detail } = await viewCodeHubTaskByIid(
        { viewCodeHubTask: (args) => codehubApi.viewTask(args) },
        repo,
        reference.number
      )
      const item = codeHubTaskItemFromDetail({ detail, kind, repo })
      if (!item.url) {
        miss('CodeHub 未返回该任务的链接')
        return
      }
      codehubItems.push(item)
    } catch (reason) {
      miss(`读取失败：${errorMessage(reason)}`)
    }
  })
  missing.sort((a, b) => a.number - b.number || a.repository.localeCompare(b.repository))
  return {
    viewProvider,
    githubItems: sortWorkItemsByNumber(githubItems),
    codehubItems,
    missing
  }
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
  const provider = scope.references.some((reference) => reference.provider === 'codehub')
    ? scope.references.some((reference) => reference.provider === 'github')
      ? 'github'
      : 'codehub'
    : 'github'
  useAppStore.getState().openTaskPage({
    taskSource: provider,
    ...(args.homeRepoId ? { preselectedRepoId: args.homeRepoId } : {}),
    workbenchTaskScope: scope
  })
}

/** 范围行的原生宿主解析入口（与 use-cycle-workspace-target 同口径取主仓与宿主）。 */
export function versionTaskScopeHome(): { repoId: string; hostId: ExecutionHostId } | null {
  const state = useAppStore.getState()
  const repoId = state.activeRepoId ?? state.repos[0]?.id ?? null
  const repo = state.repos.find((item) => item.id === repoId)
  if (!repo) {
    return null
  }
  return { repoId: repo.id, hostId: getRepoExecutionHostId(repo) }
}
