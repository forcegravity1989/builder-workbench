import { codehubApi } from '@/lib/codehub-api'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import {
  getGitHubRuntimeRepoId,
  getGitHubSourceRuntimeTarget
} from '@/lib/github-source-runtime-context'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { Repo } from '../../../shared/repo-types'
import type { GitHubWorkItem, ListWorkItemsResult } from '../../../shared/github/work-item-types'
import type { IssueStateEntry } from '../../../shared/github/issue-state-types'
import type { Worktree } from '../../../shared/worktree/types'
import type { VersionMaterialScope } from '../../../shared/workbench/version-material-request'
import { PlanningMaterialSchema } from '../../../shared/workbench/version-material'
import { nativeWorkspaceScope, type NativeWorkspaceScope } from './version-cycle/native-workspace'
import { findCycleWorktree } from './version-cycle/native-cycle-workspace'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import { sdlcProviderOf } from './overview-sdlc'
import {
  deriveCommitmentProgress,
  issueStateKey,
  parseTaskRepository,
  type WallCountReading,
  type WallProgressReading,
  type WallVersionReading
} from './wall-card-readings'
import type { WallProject } from './workbench-wall-projects'

/**
 * 墙卡读数的异步读取管线：版本/承诺进展走版本材料与 Issue 原生状态，
 * PR 待审走 gh/CodeHub 计数。每一步失败都返回 Unknown 语义的读数，
 * 不装绿、不装零（铁律二）；推导口径见 spec「墙卡读数」。
 */

export type PlanContext = {
  scope: NativeWorkspaceScope
  home: Worktree
  plan: Worktree
}

/**
 * 在项目各注册行里找计划固定树上下文：主工作树 + bw/week-plan。
 * 活跃仓行优先（与总览活跃上下文同源），再本机在前：同一项目两屏读同一注册行，
 * 版本不产生分叉。宿主路由不明确或同分支多工作树的行如实跳过；全部行都解析不出
 * → null（版本行显示「版本未定」——没选过版与判据不可证都不猜）。
 */
export function resolvePlanContext(
  project: WallProject,
  worktreesByRepo: Record<string, readonly Worktree[]>,
  activeRepoId: string | null
): PlanContext | null {
  const ordered =
    activeRepoId && project.rows.some((row) => row.id === activeRepoId)
      ? [
          ...project.rows.filter((row) => row.id === activeRepoId),
          ...project.rows.filter((row) => row.id !== activeRepoId)
        ]
      : project.rows
  for (const row of ordered) {
    const worktrees = worktreesByRepo[row.id] ?? []
    const home = worktrees.find((item) => item.isMainWorktree) ?? worktrees[0]
    if (!home) {
      continue
    }
    try {
      const scope = nativeWorkspaceScope(home)
      const plan = findCycleWorktree({ ...scope, workflow: 'plan' })
      if (plan) {
        return { scope, home, plan }
      }
    } catch {
      // 该行宿主/登记不明确：换下一行，不冒充。
    }
  }
  return null
}

export async function readVersionAndProgress(context: PlanContext): Promise<{
  version: WallVersionReading
  progress: WallProgressReading
}> {
  const { scope, home, plan } = context
  const materialScope: VersionMaterialScope = {
    repoId: scope.repoId,
    worktreeId: plan.id,
    hostId: scope.hostId,
    workflow: 'plan'
  }
  const historyPort = nativeVersionHistoryPort(scope.runtimeOwnerEnvironmentId)
  const materialPort = nativeVersionMaterialPort(materialScope, scope.runtimeOwnerEnvironmentId)
  try {
    // 与总览同机制：主干基线目录 + 计划树对齐 + 原生选版偏好，三者齐了才显示版本。
    const catalog = await historyPort.list({
      scope: { repoId: scope.repoId, worktreeId: home.id, hostId: scope.hostId },
      currentOnly: true
    })
    const treePlans = await historyPort.listTreePlans({
      scope: { repoId: scope.repoId, worktreeId: plan.id, hostId: scope.hostId },
      adoptedCommit: catalog.baselineCommit
    })
    if (treePlans.alignment !== 'aligned') {
      return { version: { kind: 'undecided' }, progress: { kind: 'hidden' } }
    }
    const contextVersion = await materialPort.context()
    const version = contextVersion.version
    if (
      !version ||
      ![...(catalog.records ?? []), ...(catalog.problems ?? [])].some(
        (item) => item.version === version
      )
    ) {
      return { version: { kind: 'undecided' }, progress: { kind: 'hidden' } }
    }
    const snapshot = await materialPort.read(version)
    if (!snapshot) {
      return {
        version: { kind: 'value', version },
        progress: { kind: 'unknown', reason: '计划材料读不到' }
      }
    }
    let tasks: { provider: string; repository: string; number: number }[]
    try {
      // 与计划屏同一窄化：材料文档过 schema 校验后才取 tasks，坏文件如实报读不到。
      tasks = PlanningMaterialSchema.parse(snapshot.document).tasks
    } catch {
      return {
        version: { kind: 'value', version },
        progress: { kind: 'unknown', reason: '计划材料格式读不到' }
      }
    }
    const numbersByRepository = new Map<string, number[]>()
    for (const task of tasks) {
      if (task.provider !== 'github' || parseTaskRepository(task.repository).kind !== 'github') {
        return {
          version: { kind: 'value', version },
          progress: { kind: 'unknown', reason: '任务仓库的关闭原因不可读（非 GitHub）' }
        }
      }
      const bucket = numbersByRepository.get(task.repository)
      if (bucket) {
        bucket.push(task.number)
      } else {
        numbersByRepository.set(task.repository, [task.number])
      }
    }
    const states = new Map<string, IssueStateEntry | undefined>()
    const results = await Promise.all(
      [...numbersByRepository.entries()].map(async ([repository, numbers]) => {
        const ref = parseTaskRepository(repository)
        if (ref.kind !== 'github') {
          return { repository, result: { items: [], error: '仓库坐标不可解析' } }
        }
        const result = await window.api.gh.issueStates({
          owner: ref.owner,
          repo: ref.repo,
          host: ref.host === 'github.com' ? null : ref.host,
          numbers
        })
        return { repository, result }
      })
    )
    for (const { repository, result } of results) {
      if (result.error) {
        return {
          version: { kind: 'value', version },
          progress: { kind: 'unknown', reason: `Issue 状态读不到：${result.error}` }
        }
      }
      for (const entry of result.items) {
        states.set(issueStateKey(repository, entry.number), entry)
      }
    }
    const progress = deriveCommitmentProgress(tasks, states)
    if (!progress) {
      return {
        version: { kind: 'value', version },
        progress: { kind: 'unknown', reason: '部分任务的 Issue 状态读不到' }
      }
    }
    return {
      version: { kind: 'value', version },
      progress: { kind: 'value', completed: progress.completed, open: progress.open }
    }
  } catch {
    // 读取链失败（主机离线、RPC 超时等）：版本判据不可证 → 与「没选过版」同样如实
    // 显示「版本未定」，不猜；原因留给刷新与主机连接事实解释。
    return {
      version: { kind: 'undecided' },
      progress: { kind: 'hidden' }
    }
  }
}

async function countSlotOpenPrs(repo: Repo, current: () => boolean): Promise<number> {
  const provider = sdlcProviderOf(repo)
  if (provider === 'github') {
    const context = getTaskPageRepoSourceContext(repo, 'github')
    const target = getGitHubSourceRuntimeTarget(context)
    // 每页是独立实时查询，created-desc 窗口可能在页间平移：按条目 id 去重后
    // 取 size（overview-sdlc 同语义），不拼半真计数。
    const ids = new Set<string>()
    let source = ''
    for (let page = 1; page <= 10; page++) {
      if (!current()) {
        throw new Error('读取已取消')
      }
      const params = { limit: 100, page, query: 'is:pr is:open', noCache: true }
      const result =
        target.kind === 'environment'
          ? await callRuntimeRpc<ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>>>(
              target,
              'github.listWorkItems',
              { repo: getGitHubRuntimeRepoId(context, repo.id), ...params },
              { timeoutMs: 60_000 }
            )
          : await window.api.gh.listWorkItems({ repoPath: repo.path, repoId: repo.id, ...params })
      if (result.errors?.prs) {
        throw new Error(result.errors.prs.message)
      }
      const origin = result.sources.prs
      if (!origin) {
        throw new Error('未识别仓库数据来源')
      }
      // 沿 overview-sdlc 守卫：分页期间数据来源漂移则整次读数作废，不拼半真计数。
      const nextSource = `${origin.host ?? 'github.com'}/${origin.owner}/${origin.repo}`
      if (source && source !== nextSource) {
        throw new Error('分页期间数据来源发生变化，请刷新')
      }
      source = nextSource
      for (const item of result.items) {
        ids.add(item.id)
      }
      if (result.items.length < 100) {
        return ids.size
      }
    }
    throw new Error('开放 PR 超过完整计数上限（1,000）')
  }
  if (provider === 'codehub') {
    for (const limit of [100, 500, 2_000, 10_000]) {
      if (!current()) {
        throw new Error('读取已取消')
      }
      const result = await codehubApi.listTasks({
        repoPath: repo.path,
        repoId: repo.id,
        kind: 'mr',
        state: 'opened',
        limit
      })
      if (!result.hasMore) {
        return result.items.length
      }
    }
    throw new Error('开放 MR 超过完整计数上限（10,000）')
  }
  throw new Error('代码仓平台不可识别')
}

export async function readProjectPrs(
  project: WallProject,
  repos: readonly Repo[],
  current: () => boolean
): Promise<WallCountReading> {
  try {
    let total = 0
    for (const slot of project.slots) {
      const repo = repos.find((row) => row.id === slot.repoId)
      if (!repo) {
        throw new Error(`代码仓注册行缺失：${slot.name}`)
      }
      total += await countSlotOpenPrs(repo, current)
    }
    return { kind: 'value', count: total }
  } catch (error) {
    return {
      kind: 'unknown',
      reason: `PR 待审读不到：${error instanceof Error ? error.message : String(error)}`
    }
  }
}
