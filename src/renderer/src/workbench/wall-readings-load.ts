import { codehubApi } from '@/lib/codehub-api'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import {
  getGitHubRuntimeRepoId,
  getGitHubSourceRuntimeTarget
} from '@/lib/github-source-runtime-context'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { Repo } from '../../../shared/repo-types'
import type { GitHubWorkItem, ListWorkItemsResult } from '../../../shared/github/work-item-types'
import type { VersionMaterialScope } from '../../../shared/workbench/version-material-request'
import {
  PlanningMaterialSchema,
  type PlanningMaterial
} from '../../../shared/workbench/version-material'
import type { PlanContext } from './wall-plan-context'
import type { CycleScope } from './version-cycle/ports'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import { sdlcProviderOf } from './overview-sdlc'
import { readCodeHubTaskStates } from './wall-readings-codehub'
import {
  deriveCommitmentProgress,
  issueStateKey,
  parseTaskRepository,
  type WallCountReading,
  type WallProgressReading,
  type WallTaskState,
  type WallVersionReading
} from './wall-card-readings'
import type { WallProject } from './workbench-wall-projects'

/**
 * 墙卡读数的异步读取管线：版本/承诺进展走版本材料与 Issue 原生状态，
 * PR 待审走 gh/CodeHub 计数。每一步失败都返回 Unknown 语义的读数，
 * 不装绿、不装零（铁律二）；推导口径见 spec「墙卡读数」。
 */

export async function readVersionAndProgress(
  context: PlanContext,
  project: WallProject
): Promise<{
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
    // 版本标签只看两个主干事实：原生选版偏好 + 主干基线目录命中。
    const catalog = await historyPort.list({
      scope: { repoId: scope.repoId, worktreeId: home.id, hostId: scope.hostId },
      currentOnly: true
    })
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
    // 计划树对齐只门控承诺进展的材料新鲜度：计划树落后主干时草稿可能是旧文件，
    // 把旧计数当现状显示等同撒谎；此时版本照显、进展如实「—」并给可行动原因。
    const treePlans = await historyPort.listTreePlans({
      scope: { repoId: scope.repoId, worktreeId: plan.id, hostId: scope.hostId },
      adoptedCommit: catalog.baselineCommit
    })
    if (treePlans.alignment !== 'aligned') {
      return {
        version: { kind: 'value', version },
        progress: {
          kind: 'unknown',
          reason: '计划树未同步主干基线，承诺进展暂不可读（计划屏「更新代码」可同步）'
        }
      }
    }
    const snapshot = await materialPort.read(version)
    if (!snapshot) {
      return {
        version: { kind: 'value', version },
        progress: { kind: 'unknown', reason: '计划材料读不到' }
      }
    }
    let tasks: PlanningMaterial['tasks']
    try {
      // 与计划屏同一窄化：材料文档过 schema 校验后才取 tasks，坏文件如实报读不到。
      tasks = PlanningMaterialSchema.parse(snapshot.document).tasks
    } catch {
      return {
        version: { kind: 'value', version },
        progress: { kind: 'unknown', reason: '计划材料格式读不到' }
      }
    }
    // provider 准入在发起任何请求前判定（全有或全无）：GitHub 走每仓一次
    // GraphQL 批量，CodeHub 复用任务屏同一解析与读取语义逐条读回；
    // 其余 provider 未接入墙卡计数，如实整行「—」。
    const githubNumbersByRepository = new Map<string, number[]>()
    const codehubTasks: PlanningMaterial['tasks'] = []
    for (const task of tasks) {
      if (task.provider === 'github' && parseTaskRepository(task.repository).kind === 'github') {
        const bucket = githubNumbersByRepository.get(task.repository)
        if (bucket) {
          bucket.push(task.number)
        } else {
          githubNumbersByRepository.set(task.repository, [task.number])
        }
        continue
      }
      if (task.provider === 'codehub') {
        codehubTasks.push(task)
        continue
      }
      const reason =
        task.provider === 'github'
          ? `任务仓库坐标不可解析：${task.repository}`
          : `任务状态读不到：provider ${task.provider} 未接入墙卡计数`
      return { version: { kind: 'value', version }, progress: { kind: 'unknown', reason } }
    }
    const states = new Map<string, WallTaskState>()
    const results = await Promise.all(
      [...githubNumbersByRepository.entries()].map(async ([repository, numbers]) => {
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
        states.set(issueStateKey(repository, entry.number), { state: entry.state })
      }
    }
    // CodeHub：身份匹配注册行（解析同任务屏）、只读 Issue 不做 MR 兜底
    // （防同号 MR 误计，语义与成本见 wall-readings-codehub）。
    const cycleScope: CycleScope = { ...scope, workflow: 'plan' }
    try {
      const codehubStates = await readCodeHubTaskStates(codehubTasks, project.rows, cycleScope)
      for (const [key, state] of codehubStates) {
        states.set(key, state)
      }
    } catch (error) {
      return {
        version: { kind: 'value', version },
        progress: {
          kind: 'unknown',
          reason: `CodeHub 任务状态读不到：${error instanceof Error ? error.message : String(error)}`
        }
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
    // 每页是独立实时查询，created-desc 窗口可能在页间平移：按条目 id 汇集取 size
    // 消除重复方向的多计；分页期间发生关闭/合入时窗口平移可能整页跳过边界条目
    // （漏计方向），与 overview-sdlc 同族限制，按现值读数承受、不装 Unknown。
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
