import type { Worktree } from '../worktree/types'
import { normalizeStoredMonicaVersionBinding, type MonicaVersionBinding } from './version-binding'
import type { VersionHistoryCatalog } from './version-history'

/**
 * G2 版本目录（逻辑目录，不是实体树）：目录 = 主干已提交材料 ∪ 明确绑定的版本，
 * 去重保留材料来源；已清理版本仍入列（收起回看）。合入状态只由主干材料与计划
 * 绑定证据决定，工作区活跃状态独立推导。绑定实例从原生登记现算汇总（含配对宿主），
 * 任何路径删树后登记消失、目录自然不显示悬空绑定。本模块不持久化目录副本。
 */

/** 目录中的一个存活绑定实例；跨宿主汇总沿归属登记，不复制凭据或路径。 */
export type VersionCatalogWorkspace = {
  worktreeId: string
  instanceId: string | null
  hostId: string | null
  runtimeOwnerEnvironmentId: string | null
  createdAt?: number
  binding: MonicaVersionBinding
}

/** 目标目录条目：从已保存计划投影（goalId 稳定，改名/排序不变）。 */
export type VersionCatalogGoalRef = { goalId: string; title: string }

export type VersionCatalogMaterialRef = {
  cycleId: string
  revision: string
  sourceCommit: string
  committedAt: string
}

/** 草稿目录来源：已保存计划（可能未合入主干）的一条版本派生。 */
export type VersionCatalogDraftSource = {
  version: string
  cycleId: string
  revision: string
}

export type VersionCatalogMergeStatus = 'merged' | 'unmerged' | 'unknown'

export type VersionCatalogEntry = {
  version: string
  /** The trunk baseline proves whether this version's plan has been merged. */
  mergeStatus: VersionCatalogMergeStatus
  /** Absent before adoption; null when the plan is on trunk but its entry time is unknown. */
  planEnteredAt?: number | null
  /** Earliest known creation time of a live plan workspace for this version. */
  planStartedAt?: number | null
  /** 已合入主干的材料（业务正本来源）；草稿只附加、永不覆盖它。 */
  material: {
    plan?: VersionCatalogMaterialRef
    acceptance?: VersionCatalogMaterialRef
  }
  /** 材料存在但读不到的问题如实列出，不隐藏有效记录。 */
  problems: { workflow: 'plan' | 'acceptance'; code: string; message: string }[]
  /** 已保存计划工作树投影；有 material.plan 时只用于比较修订，不冒充定稿。 */
  draft?: { cycleId: string; revision: string }
  goals: VersionCatalogGoalRef[]
  workspaces: VersionCatalogWorkspace[]
  /** working=在制（有存活绑定）；retired=已清理或未准备，条目保留、收起回看。 */
  state: 'working' | 'retired'
}

type VersionDisplayEvidence = Pick<
  VersionCatalogEntry,
  'version' | 'mergeStatus' | 'planEnteredAt' | 'planStartedAt'
>

export function hasUnmergedPlanDraft(
  entry: Pick<VersionCatalogEntry, 'material' | 'draft'>
): boolean {
  return Boolean(
    entry.material.plan && entry.draft && entry.draft.revision !== entry.material.plan.revision
  )
}

function mergeStatusRank(status: VersionCatalogMergeStatus): number {
  if (status === 'unmerged') {
    return 0
  }
  if (status === 'merged') {
    return 1
  }
  return 2
}

function compareKnownTimesDescending(a: number | null | undefined, b: number | null | undefined) {
  const aKnown = a !== null && a !== undefined && Number.isFinite(a)
  const bKnown = b !== null && b !== undefined && Number.isFinite(b)
  if (aKnown && bKnown) {
    return b! - a!
  }
  if (aKnown !== bKnown) {
    return aKnown ? -1 : 1
  }
  return 0
}

export function compareVersionDisplayOrder(a: VersionDisplayEvidence, b: VersionDisplayEvidence) {
  const statusOrder = mergeStatusRank(a.mergeStatus) - mergeStatusRank(b.mergeStatus)
  if (statusOrder !== 0) {
    return statusOrder
  }
  const timeOrder = compareKnownTimesDescending(
    a.mergeStatus === 'unmerged' ? a.planStartedAt : a.planEnteredAt,
    b.mergeStatus === 'unmerged' ? b.planStartedAt : b.planEnteredAt
  )
  return timeOrder !== 0 ? timeOrder : compareMaterialVersions(a.version, b.version)
}

/**
 * 从原生登记集合提取存活绑定实例。输入是调用方已经聚合好的登记快照
 * （renderer store 含配对宿主同步行）；归档树不算存活工作区。
 * 项目过滤前提（P1 延后项收口）：给出 projectId 时，登记行带 projectId 且
 * 不同项目的一律排除；行上没有 projectId 时无法证伪、保留（绑定读写仍由
 * owner runtime 的 project 核对围栏）。
 */
export function collectVersionCatalogWorkspaces(
  worktrees: readonly Worktree[],
  repoIds: readonly string[],
  projectId?: string | null
): VersionCatalogWorkspace[] {
  const wanted = new Set(repoIds)
  const collected: VersionCatalogWorkspace[] = []
  for (const worktree of worktrees) {
    if (!wanted.has(worktree.repoId) || worktree.isArchived) {
      continue
    }
    if (projectId && worktree.projectId && worktree.projectId !== projectId) {
      continue
    }
    const binding = normalizeStoredMonicaVersionBinding(worktree.workbenchVersionBinding)
    if (!binding) {
      continue
    }
    collected.push({
      worktreeId: worktree.id,
      instanceId: worktree.instanceId ?? null,
      hostId: worktree.hostId ?? null,
      runtimeOwnerEnvironmentId: worktree.runtimeOwnerEnvironmentId ?? null,
      createdAt: worktree.createdAt,
      binding
    })
  }
  return collected
}

/**
 * 版本感知排序的稳定兜底：点分段逐段比较，纯数字段按数值（v0.9 < v0.10），
 * 其余按字典序；同输入同输出，不把版本号当作合入状态证据。
 */
export function compareMaterialVersions(a: string, b: string): number {
  const partsA = a.split('.')
  const partsB = b.split('.')
  const length = Math.max(partsA.length, partsB.length)
  for (let index = 0; index < length; index += 1) {
    const x = partsA[index] ?? ''
    const y = partsB[index] ?? ''
    const xn = /^\d+$/.test(x) ? Number(x) : null
    const yn = /^\d+$/.test(y) ? Number(y) : null
    if (xn !== null && yn !== null) {
      if (xn !== yn) {
        return xn - yn
      }
      continue
    }
    const compared = x.localeCompare(y)
    if (compared !== 0) {
      return compared
    }
  }
  return 0
}

/**
 * 合并目录：已提交材料 ∪ 草稿派生 ∪ 存活绑定。纯函数——同输入同输出，
 * mergeStatus 从主干与计划绑定证据推导，state 仍只表示是否存在存活绑定。
 */
export function mergeVersionCatalog(args: {
  committed: VersionHistoryCatalog
  /** False means the baseline could not be read, so absence is not proof of an unmerged plan. */
  historyAvailable?: boolean
  drafts?: readonly VersionCatalogDraftSource[] | null
  goalsByVersion?: ReadonlyMap<string, readonly VersionCatalogGoalRef[]> | null
  workspaces?: readonly VersionCatalogWorkspace[] | null
}): VersionCatalogEntry[] {
  const entries = new Map<string, VersionCatalogEntry>()
  const entryFor = (version: string): VersionCatalogEntry => {
    const existing = entries.get(version)
    if (existing) {
      return existing
    }
    const created: VersionCatalogEntry = {
      version,
      mergeStatus: 'unknown',
      material: {},
      problems: [],
      goals: [],
      workspaces: [],
      state: 'retired'
    }
    entries.set(version, created)
    return created
  }

  for (const record of args.committed.records) {
    const entry = entryFor(record.version)
    const ref: VersionCatalogMaterialRef = {
      cycleId: record.cycleId,
      revision: record.revision,
      sourceCommit: record.sourceCommit,
      committedAt: record.committedAt
    }
    // 同版同流程多条记录（历史多周）时保留目录读到的第一条，不互相覆盖。
    if (record.workflow === 'plan') {
      entry.material.plan ??= ref
      entry.planEnteredAt = null
    } else {
      entry.material.acceptance ??= ref
    }
  }
  for (const problem of args.committed.problems) {
    const entry = entryFor(problem.version)
    if (problem.workflow === 'plan') {
      entry.planEnteredAt = null
    }
    entry.problems.push({
      workflow: problem.workflow,
      code: problem.code,
      message: problem.message
    })
  }
  for (const draft of args.drafts ?? []) {
    // 草稿只作为附加事实登记；有已合入材料时材料仍是正本来源。
    entryFor(draft.version).draft = { cycleId: draft.cycleId, revision: draft.revision }
  }
  for (const [version, goals] of args.goalsByVersion ?? []) {
    entryFor(version).goals = [...goals]
  }
  for (const workspace of args.workspaces ?? []) {
    entryFor(workspace.binding.version).workspaces.push(workspace)
  }
  for (const entry of entries.values()) {
    const planWorkspaces = entry.workspaces.filter(({ binding }) => binding.workflow === 'plan')
    if (planWorkspaces.length > 0) {
      const knownTimes = planWorkspaces
        .map(({ createdAt }) => createdAt)
        .filter(
          (createdAt): createdAt is number => createdAt !== undefined && Number.isFinite(createdAt)
        )
      entry.planStartedAt = knownTimes.length > 0 ? Math.min(...knownTimes) : null
    }
    const hasMaterial = Boolean(entry.material.plan)
    const hasPlanProblem = entry.problems.some((problem) => problem.workflow === 'plan')
    entry.mergeStatus = hasMaterial
      ? 'merged'
      : args.historyAvailable !== false && !hasPlanProblem && planWorkspaces.length > 0
        ? 'unmerged'
        : 'unknown'
    entry.state = entry.workspaces.length > 0 ? 'working' : 'retired'
  }
  return [...entries.values()]
}

/**
 * 草稿目录与目标派生的缓存分隔键：owner（宿主+归属 runtime）/项目/仓库/版本/
 * 材料修订。切版、换修订或不同 owner 读取不得命中同一份缓存（防切版污染）。
 */
export function versionCatalogCacheKey(parts: {
  hostId: string
  runtimeOwnerEnvironmentId?: string | null
  projectId: string
  repoId: string
  version: string
  revision: string
}): string {
  return JSON.stringify([
    parts.hostId,
    parts.runtimeOwnerEnvironmentId ?? '',
    parts.projectId,
    parts.repoId,
    parts.version,
    parts.revision
  ])
}
