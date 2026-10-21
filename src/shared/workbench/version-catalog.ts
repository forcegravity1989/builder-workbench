import type { Worktree } from '../worktree/types'
import {
  normalizeStoredWorkbenchVersionBinding,
  type WorkbenchVersionBinding
} from './version-binding'
import type { VersionHistoryCatalog } from './version-history'

/**
 * G2 版本目录（逻辑目录，不是实体树）：目录 = 主干已提交材料 ∪ 明确绑定的在制
 * 版本，去重保留材料来源；已清理版本仍入列（收起回看）。绑定实例从原生登记
 * 现算汇总（含配对宿主），任何路径删树后登记消失、目录自然不显示悬空绑定——
 * 本模块不持久化任何目录副本（spec「目录、绑定、持久化与共享」）。
 */

/** 目录中的一个存活绑定实例；跨宿主汇总沿归属登记，不复制凭据或路径。 */
export type VersionCatalogWorkspace = {
  worktreeId: string
  instanceId: string | null
  hostId: string | null
  runtimeOwnerEnvironmentId: string | null
  binding: WorkbenchVersionBinding
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

export type VersionCatalogEntry = {
  version: string
  /** 已合入主干的材料（业务正本来源）；草稿只附加、永不覆盖它。 */
  material: {
    plan?: VersionCatalogMaterialRef
    acceptance?: VersionCatalogMaterialRef
  }
  /** 材料存在但读不到的问题如实列出，不隐藏有效记录。 */
  problems: { workflow: 'plan' | 'acceptance'; code: string; message: string }[]
  /** 已保存计划的未合入草稿；有 material.plan 时仅标注差异存在，不冒充定稿。 */
  draft?: { cycleId: string; revision: string }
  goals: VersionCatalogGoalRef[]
  workspaces: VersionCatalogWorkspace[]
  /** working=在制（有存活绑定）；retired=已清理或未准备，条目保留、收起回看。 */
  state: 'working' | 'retired'
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
    const binding = normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
    if (!binding) {
      continue
    }
    collected.push({
      worktreeId: worktree.id,
      instanceId: worktree.instanceId ?? null,
      hostId: worktree.hostId ?? null,
      runtimeOwnerEnvironmentId: worktree.runtimeOwnerEnvironmentId ?? null,
      binding
    })
  }
  return collected
}

/**
 * 版本感知排序（P2 延后项①收口）：点分段逐段比较，纯数字段按数值
 * （v0.9 < v0.10），其余按字典序；同输入同输出，不做语义猜测。
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
 * 状态（working/retired）只从存活绑定推导，没绑定就是 retired，不猜。
 */
export function mergeVersionCatalog(args: {
  committed: VersionHistoryCatalog
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
    } else {
      entry.material.acceptance ??= ref
    }
  }
  for (const problem of args.committed.problems) {
    entryFor(problem.version).problems.push({
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
    entry.state = entry.workspaces.length > 0 ? 'working' : 'retired'
  }
  return [...entries.values()].sort((a, b) => compareMaterialVersions(a.version, b.version))
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
