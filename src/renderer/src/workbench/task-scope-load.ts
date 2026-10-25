import { useAppStore } from '@/store'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { getGitHubSourceRuntimeTarget } from '@/lib/github-source-runtime-context'
import { codehubApi } from '@/lib/codehub-api'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { sortWorkItemsByNumber } from '../../../shared/work-items'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import {
  WorkbenchTaskScopeSchema,
  type WorkbenchTaskScope
} from '../../../shared/workbench/task-scope'
import type { CycleTaskReference } from './version-cycle/ports'
import { codeHubTaskItemFromDetail } from './codehub-task-item'
import { resolveReferenceRepo, viewCodeHubTaskByIid, type TaskPortDeps } from './task-port'
import { parseTaskRepository } from './wall-card-readings'

/**
 * G2 任务屏范围装载（P4）：以计划材料的完整任务引用集为范围，经原生 provider
 * 读取——GitHub 每仓一次 GraphQL 批量（#436 伴飞裁定 CF-6b，墙卡 gh:issueStates
 * 同机制的全行字段版；批内 miss/整组失败回落既有单条读，环境宿主引用保持
 * runtime 路由不跨机）；CodeHub 无批量命令面，维持逐条 viewTask（并行池）——
 * 产出可直接进原生列表的行与「无法读取/未展开」的缺数据行。缺数据保留位置、
 * 数量与原因，不静默丢弃。读取失败如实缺席，不装绿；本模块不建任何任务正本
 * 或第二缓存。
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

/** 「github 优先」判定单实现：范围装载与进任务屏的 openTaskPage 共用。 */
function viewProviderFor(references: readonly { provider: string }[]): 'github' | 'codehub' {
  return references.some((reference) => reference.provider === 'github') ||
    !references.some((reference) => reference.provider === 'codehub')
    ? 'github'
    : 'codehub'
}

const SCOPE_READ_CONCURRENCY = 6

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let start = 0; start < items.length; start += limit) {
    results.push(...(await Promise.all(items.slice(start, start + limit).map(run))))
  }
  return results
}

type ScopeReference = WorkbenchTaskScope['references'][number]

type ScopeRefOutcome = {
  item: GitHubWorkItem | CodeHubTaskItem | null
  miss?: TaskScopeMissingRow
}

/**
 * GitHub 引用批量快路径（#436 伴飞裁定 CF-6b）：按材料坐标（host/owner/repo，
 * 墙卡 parseTaskRepository 同口径）分组，每仓一次 gh:workItemsBatch（本机 gh
 * 登录态、平台侧读取，墙卡 gh:issueStates 同机制的全行字段版）。不进批量的
 * 一律回落单条读——登记/来源上下文解析不出、坐标不可解析、环境宿主归属
 * （runtime 路由不跨机代打）、整组查询失败（含 web shim 如实未接入）、
 * GraphQL 双别名未命中（转移/占号）；missing 语义与网络行为逐字不变。
 * repoId 按解析到的登记仓回填（与单条链同一 stamp）。
 */
async function loadGitHubRefsBatched(args: {
  refs: readonly ScopeReference[]
  deps: Pick<TaskPortDeps, 'repos'>
  home: { repoId: string; hostId: ExecutionHostId }
  readSingle: (reference: ScopeReference) => Promise<ScopeRefOutcome>
}): Promise<ScopeRefOutcome[]> {
  const { refs, deps, home, readSingle } = args
  type GroupEntry = { reference: ScopeReference; repoId: string }
  const groups = new Map<
    string,
    { owner: string; repo: string; host: string; entries: GroupEntry[] }
  >()
  const fallback: ScopeReference[] = []
  for (const reference of refs) {
    const repo = resolveReferenceRepo(deps, home, reference)
    const sourceContext = repo ? getTaskPageRepoSourceContext(repo, 'github') : null
    const parsed = parseTaskRepository(reference.repository)
    const remoteRouted =
      sourceContext != null && getGitHubSourceRuntimeTarget(sourceContext).kind === 'environment'
    if (!repo || !sourceContext || parsed.kind !== 'github' || remoteRouted) {
      fallback.push(reference)
      continue
    }
    const key = `${parsed.host}\u0000${parsed.owner}\u0000${parsed.repo}`
    const group = groups.get(key)
    if (group) {
      group.entries.push({ reference, repoId: repo.id })
    } else {
      groups.set(key, {
        owner: parsed.owner,
        repo: parsed.repo,
        host: parsed.host,
        entries: [{ reference, repoId: repo.id }]
      })
    }
  }
  const outcomes: ScopeRefOutcome[] = []
  const results = await Promise.all(
    [...groups.values()].map(async (group) => ({
      group,
      result: await window.api.gh.workItemsBatch({
        owner: group.owner,
        repo: group.repo,
        host: group.host === 'github.com' ? null : group.host,
        numbers: [...new Set(group.entries.map((entry) => entry.reference.number))]
      })
    }))
  )
  for (const { group, result } of results) {
    if (result.error) {
      fallback.push(...group.entries.map((entry) => entry.reference))
      continue
    }
    const byNumber = new Map(result.items.map((item) => [item.number, item]))
    for (const entry of group.entries) {
      const item = byNumber.get(entry.reference.number)
      if (item) {
        outcomes.push({ item: { ...item, repoId: entry.repoId } as GitHubWorkItem })
      } else {
        fallback.push(entry.reference)
      }
    }
  }
  outcomes.push(...(await mapPool(fallback, SCOPE_READ_CONCURRENCY, readSingle)))
  return outcomes
}

export async function loadWorkbenchTaskScope(
  scope: WorkbenchTaskScope,
  home: { repoId: string; hostId: ExecutionHostId }
): Promise<TaskScopeLoadResult> {
  const deps = { repos: () => useAppStore.getState().repos }
  const missing: TaskScopeMissingRow[] = []
  // 计划材料可能对同一任务重复引用：按 provider+仓库+编号去重，防重复读取、
  // 重复行与计数虚增。
  const seen = new Set<string>()
  const references = scope.references.filter((reference) => {
    // Why: 同一仓库的两种写法（host/group/repo 与完整克隆 URL）都会解析到同一
    // repo.id；按原始字符串去重会漏出重复行、重复 React key 与计数虚增。解析失败
    // 回落原始字符串（missing 通道计数不受影响）。
    const repo =
      reference.provider === 'github' || reference.provider === 'codehub'
        ? resolveReferenceRepo(deps, home, reference)
        : null
    const key = `${reference.provider}:${repo?.id ?? reference.repository}:${reference.number}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
  const githubRefs = references.filter((reference) => reference.provider === 'github')
  const codehubRefs = references.filter((reference) => reference.provider === 'codehub')
  for (const reference of references) {
    if (reference.provider !== 'github' && reference.provider !== 'codehub') {
      missing.push({
        provider: reference.provider,
        repository: reference.repository,
        number: reference.number,
        reason: `provider ${reference.provider} 尚未接入 Workbench 任务范围读取`
      })
    }
  }
  const viewProvider = viewProviderFor(references)
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
  // 单条读回=既有语义逐字保留（miss 文案、环境宿主 runtime 路由、CodeHub 逐条）；
  // 批量只作 GitHub 本地 gh 引用的快路径，任何不确定都回落到这里。
  const readSingle = async (reference: ScopeReference): Promise<ScopeRefOutcome> => {
    const miss = (reason: string): ScopeRefOutcome => ({
      item: null,
      miss: {
        provider: reference.provider,
        repository: reference.repository,
        number: reference.number,
        reason
      }
    })
    const repo = resolveReferenceRepo(deps, home, reference)
    if (!repo) {
      return miss(`未在已登记项目中找到引用仓库 ${reference.repository}`)
    }
    if (viewProvider === 'github') {
      const sourceContext = getTaskPageRepoSourceContext(repo, 'github')
      if (!sourceContext) {
        return miss('无法解析 GitHub 任务来源上下文')
      }
      try {
        const item = await lookupGitHubWorkItemForSource({
          repoPath: repo.path,
          repoId: repo.id,
          sourceContext,
          number: reference.number
        })
        if (!item) {
          return miss(`GitHub 未返回编号 ${reference.number} 的工作项`)
        }
        return { item }
      } catch (reason) {
        return miss(`读取失败：${errorMessage(reason)}`)
      }
    }
    try {
      const { kind, detail } = await viewCodeHubTaskByIid(
        { viewCodeHubTask: (args) => codehubApi.viewTask(args) },
        repo,
        reference.number
      )
      const item = codeHubTaskItemFromDetail({ detail, kind, repo })
      if (!item.url) {
        return miss('CodeHub 未返回该任务的链接')
      }
      return { item }
    } catch (reason) {
      return miss(`读取失败：${errorMessage(reason)}`)
    }
  }
  const outcomes: ScopeRefOutcome[] =
    viewProvider === 'github'
      ? await loadGitHubRefsBatched({ refs: viewRefs, deps, home, readSingle })
      : await mapPool(viewRefs, SCOPE_READ_CONCURRENCY, readSingle)
  // 装配序不影响输出：GitHub 行按原生列表惯例排序、缺行按编号/仓库排序；
  // 完成序不进渲染，刷新不抖序（批量化后 outcomes=批量命中在前、回落在后）。
  const githubItems: GitHubWorkItem[] = []
  const codehubItems: CodeHubTaskItem[] = []
  for (const outcome of outcomes) {
    if (outcome.miss) {
      missing.push(outcome.miss)
      continue
    }
    if (outcome.item && 'number' in outcome.item) {
      githubItems.push(outcome.item)
    } else if (outcome.item) {
      codehubItems.push(outcome.item)
    }
  }
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
  const provider = viewProviderFor(scope.references)
  useAppStore.getState().openTaskPage({
    taskSource: provider,
    ...(args.homeRepoId ? { preselectedRepoId: args.homeRepoId } : {}),
    // 入口自证契约：范围对象过共享 schema 后才进 store（防拼装回归）。
    workbenchTaskScope: WorkbenchTaskScopeSchema.parse(scope)
  })
}

/** 范围行的原生宿主解析入口（与 use-cycle-workspace-target 同口径取主仓与宿主）。 */
function versionTaskScopeHome(): { repoId: string; hostId: ExecutionHostId } | null {
  const state = useAppStore.getState()
  const repoId = state.activeRepoId ?? state.repos[0]?.id ?? null
  const repo = state.repos.find((item) => item.id === repoId)
  if (!repo) {
    return null
  }
  return { repoId: repo.id, hostId: getRepoExecutionHostId(repo) }
}

/** 宿主解析必须成功才可装载范围；失败文案住 BW 模块（原生文件不引新词条）。 */
export function requireVersionTaskScopeHome(): {
  repoId: string
  hostId: ExecutionHostId
} {
  const home = versionTaskScopeHome()
  if (!home) {
    throw new Error('无法解析当前项目的任务范围宿主')
  }
  return home
}
