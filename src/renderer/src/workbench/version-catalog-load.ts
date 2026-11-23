import type { Worktree } from '../../../shared/worktree/types'
import {
  PlanningMaterialSchema,
  type PlanningMaterial
} from '../../../shared/workbench/version-material'
import {
  collectVersionCatalogWorkspaces,
  mergeVersionCatalog,
  versionCatalogCacheKey,
  type VersionCatalogDraftSource,
  type VersionCatalogEntry,
  type VersionCatalogGoalRef
} from '../../../shared/workbench/version-catalog'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import type { VersionHistoryCatalog } from '../../../shared/workbench/version-history'
import { isVersionHostDisconnected } from './version-worktree-host'
import {
  committedCatalogGoalKey,
  draftCatalogTreeKey,
  retainUnavailableCatalogSources,
  type CatalogGoalSource
} from './version-catalog-retention'

type DraftDerivation = {
  draft: VersionCatalogDraftSource
  goals: VersionCatalogGoalRef[]
}

/** 已提交计划的目标目录。 */
type CommittedPlanProjection = {
  goals: VersionCatalogGoalRef[]
}

function projectPlanGoals(goals: PlanningMaterial['goals']): VersionCatalogGoalRef[] {
  return goals.map((goal) => ({ goalId: goal.goalId, title: goal.title }))
}

/**
 * 已保存计划的派生缓存，按 versionCatalogCacheKey（owner/项目/仓库/版本/修订）
 * 分隔；只是读取加速，不是任何状态的正本，页面重载即清空。修订变化产生新键，
 * 旧派生不会被新版本上下文命中。
 */
const draftDerivations = new Map<string, DraftDerivation>()
const committedPlansCache = new Map<string, CommittedPlanProjection>()

function deriveFromSavedPlan(
  document: unknown,
  version: string,
  revision: string
): DraftDerivation | null {
  const parsed = PlanningMaterialSchema.safeParse(document)
  if (!parsed.success) {
    // 计划格式读不到：该版草稿列如实缺席，不猜内容、不冒充定稿。
    return null
  }
  return {
    draft: { version, cycleId: parsed.data.cycleId, revision },
    goals: projectPlanGoals(parsed.data.goals)
  }
}

export type VersionCatalogPlanTree = {
  worktreeId: string
  instanceId?: string
  repoId?: string
  ownerError?: string
  version: string
  /** 树自身的执行宿主与归属 runtime（配对宿主树按 owner 路由，不假定与主树同宿主）。 */
  hostId?: string | null
  runtimeOwnerEnvironmentId?: string | null
}

type VersionCatalogProblem = { code: string; message: string }

export type VersionCatalogLoad = {
  entries: VersionCatalogEntry[]
  /** 草稿/已提交派生的读取失败如实上报（problem 通道）；缺席不等于没有草稿。 */
  problems: VersionCatalogProblem[]
  /** Provenance for failure retention in this view; never persisted or used as a cache policy. */
  goalSources?: Record<string, CatalogGoalSource>
  history?: { key: string; ready: boolean; error: string | null; baselineCommit?: string }
}

/**
 * 装载所选来源的版本目录：主干已提交材料 ∪ 存活绑定；草稿目录、目标与任务
 * 引用从已绑定计划树的已保存计划派生；有已提交材料但没有草稿派生目标的版本，从已提交计划
 * 派生目标与任务引用（只读回看，不要求树存在）。已清理版本随材料仍入列
 * （retired 收起）。读取失败如实进 problems（调用方显示未知与原因），不装绿。
 */
export async function loadVersionCatalog(args: {
  scope: NativeWorkspaceScope
  /** 主工作树登记行：主干基线材料与已提交计划回看的读取入口。 */
  homeWorktreeId: string
  homeInstanceId?: string
  /** 计划树读取入口集：旧固定树（version null）＋各版绑定计划树；缺失时相应来源如实缺席。 */
  planTrees?: readonly VersionCatalogPlanTree[] | null
  /** 原生登记全集（renderer store，含配对宿主同步行），从中提取存活绑定。 */
  worktrees: readonly Worktree[]
  /** 项目全部注册行；缺省用 scope.repoId。 */
  repoIds?: readonly string[]
  /** 项目过滤前提（登记行带 projectId 时按项目排除，见 collect 注释）。 */
  projectId?: string | null
  /** 当前视图已读回的目录；仅在对应来源读取失败时保留，不持久化。 */
  previous?: VersionCatalogLoad | null
}): Promise<VersionCatalogLoad> {
  const { scope, homeWorktreeId, worktrees } = args
  const repoIds = args.repoIds ?? [scope.repoId]
  const historyPort = nativeVersionHistoryPort(scope.runtimeOwnerEnvironmentId)
  const historyKey = JSON.stringify([
    scope.projectId,
    scope.repoId,
    scope.hostId,
    scope.runtimeOwnerEnvironmentId ?? '',
    homeWorktreeId,
    args.homeInstanceId ?? ''
  ])
  const previousLoad = args.previous
  const sameHistory = previousLoad?.history?.key === historyKey
  const problems: VersionCatalogProblem[] = []
  let committed: VersionHistoryCatalog = { records: [], problems: [] }
  let historyUnavailable = false
  let historyError: string | null = null
  try {
    committed = await historyPort.list({
      scope: { repoId: scope.repoId, worktreeId: homeWorktreeId, hostId: scope.hostId },
      currentOnly: true
    })
  } catch (reason) {
    historyUnavailable = true
    historyError = reason instanceof Error ? reason.message : String(reason)
    if (!isVersionHostDisconnected(scope)) {
      problems.push({
        code: 'history-source-unavailable',
        message: `已提交材料读取失败：${historyError}`
      })
    }
  }

  const drafts: VersionCatalogDraftSource[] = []
  const goalsByVersion = new Map<string, VersionCatalogGoalRef[]>()
  const goalSources: Record<string, CatalogGoalSource> = Object.create(null)
  // null means the tree could not be listed; otherwise only these versions failed.
  const unavailableDrafts = new Map<string, Set<string> | null>()
  const planTrees = args.planTrees ?? []
  const planCounts = new Map<string, number>()
  for (const { version } of planTrees) {
    planCounts.set(version, (planCounts.get(version) ?? 0) + 1)
  }
  for (const planTree of planTrees) {
    if (planCounts.get(planTree.version) !== 1) {
      continue
    }
    // 单个计划树读取失败不拖垮整个目录：其余来源照实返回，失败进 problem 通道。
    try {
      if (planTree.ownerError) {
        throw new Error(planTree.ownerError)
      }
      const materialPort = nativeVersionMaterialPort(
        {
          repoId: planTree.repoId ?? scope.repoId,
          worktreeId: planTree.worktreeId,
          hostId: planTree.hostId ?? scope.hostId,
          workflow: 'plan'
        },
        planTree.hostId
          ? (planTree.runtimeOwnerEnvironmentId ?? undefined)
          : scope.runtimeOwnerEnvironmentId
      )
      const candidates = await materialPort.list()
      for (const candidate of candidates) {
        if (candidate.version !== planTree.version) {
          continue
        }
        try {
          if (candidate.state !== 'ready') {
            throw new Error(
              candidate.error ?? `版本 ${candidate.version} 的计划材料不可读（${candidate.state}）`
            )
          }
          const snapshot = await materialPort.read(candidate.version)
          if (!snapshot) {
            throw new Error(`版本 ${candidate.version} 的计划材料已变化，请刷新重试。`)
          }
          const key = versionCatalogCacheKey({
            hostId: planTree.hostId ?? scope.hostId,
            runtimeOwnerEnvironmentId: planTree.hostId
              ? planTree.runtimeOwnerEnvironmentId
              : scope.runtimeOwnerEnvironmentId,
            projectId: scope.projectId,
            repoId: planTree.repoId ?? scope.repoId,
            version: candidate.version,
            revision: snapshot.revision
          })
          let derivation = draftDerivations.get(key)
          if (!derivation) {
            const derived = deriveFromSavedPlan(
              snapshot.document,
              candidate.version,
              snapshot.revision
            )
            if (!derived) {
              throw new Error(`版本 ${candidate.version} 的计划材料格式无效。`)
            }
            derivation = derived
            draftDerivations.set(key, derivation)
          }
          const existing = goalsByVersion.get(candidate.version)
          if (!existing) {
            drafts.push(derivation.draft)
            goalsByVersion.set(candidate.version, derivation.goals)
            goalSources[candidate.version] = {
              kind: 'draft',
              treeKey: draftCatalogTreeKey(scope, planTree),
              draft: derivation.draft
            }
          }
        } catch (reason) {
          const treeKey = draftCatalogTreeKey(scope, planTree)
          const failedVersions = unavailableDrafts.get(treeKey) ?? new Set<string>()
          failedVersions.add(candidate.version)
          unavailableDrafts.set(treeKey, failedVersions)
          if (!isVersionHostDisconnected(planTree)) {
            problems.push({
              code: 'draft-source-unavailable',
              message: reason instanceof Error ? reason.message : String(reason)
            })
          }
        }
      }
    } catch (reason) {
      unavailableDrafts.set(draftCatalogTreeKey(scope, planTree), null)
      if (!isVersionHostDisconnected(planTree)) {
        problems.push({
          code: 'draft-source-unavailable',
          message: `版本 ${planTree.version} 的计划草稿读取失败：${
            reason instanceof Error ? reason.message : String(reason)
          }`
        })
      }
    }
  }

  const entries = mergeVersionCatalog({
    committed,
    historyAvailable: !historyUnavailable,
    drafts,
    goalsByVersion,
    workspaces: collectVersionCatalogWorkspaces(worktrees, repoIds, args.projectId)
  })

  retainUnavailableCatalogSources({
    entries,
    previousEntries: previousLoad?.entries ?? [],
    previousSources: previousLoad?.goalSources,
    goalSources,
    availableDraftVersions: new Set(goalsByVersion.keys()),
    unavailableDrafts,
    historyKey,
    retainHistory: sameHistory && historyUnavailable
  })

  for (const entry of entries) {
    if ((planCounts.get(entry.version) ?? 0) > 1) {
      entry.problems.push({
        workflow: 'plan',
        code: 'plan-source-ambiguous',
        message: '有多个计划工作区。点「计划」选择要打开的工作区。'
      })
    }
    // 已提交计划可从固定提交读回目标，历史回看不要求绑定树。
    const planRef = entry.material.plan
    if (!planRef || entry.goals.length > 0 || historyUnavailable) {
      continue
    }
    const key = versionCatalogCacheKey({
      hostId: scope.hostId,
      runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId,
      projectId: scope.projectId,
      repoId: scope.repoId,
      version: entry.version,
      revision: planRef.revision
    })
    const cached = committedPlansCache.get(key)
    if (cached) {
      entry.goals = [...cached.goals]
      goalSources[entry.version] = {
        kind: 'committed',
        key: committedCatalogGoalKey(historyKey, entry.version, planRef)
      }
      continue
    }
    try {
      const plan = await historyPort.readPlan({
        scope: { repoId: scope.repoId, worktreeId: homeWorktreeId, hostId: scope.hostId },
        planRef: {
          kind: 'committed',
          version: entry.version,
          cycleId: planRef.cycleId,
          revision: planRef.revision,
          sourceCommit: planRef.sourceCommit
        }
      })
      const projection: CommittedPlanProjection = {
        goals: projectPlanGoals(plan.document.goals)
      }
      committedPlansCache.set(key, projection)
      // 拷贝入 entry：缓存数组与目录条目不共享引用（防下游突变污染缓存）。
      entry.goals = [...projection.goals]
      goalSources[entry.version] = {
        kind: 'committed',
        key: committedCatalogGoalKey(historyKey, entry.version, planRef)
      }
    } catch (reason) {
      const previous = args.previous?.entries.find((item) => item.version === entry.version)
      const previousSource = previousLoad?.goalSources?.[entry.version]
      if (
        previous &&
        previousSource?.kind === 'committed' &&
        previousSource.key === committedCatalogGoalKey(historyKey, entry.version, planRef)
      ) {
        entry.goals = [...previous.goals]
        goalSources[entry.version] = previousSource
      }
      if (!isVersionHostDisconnected(scope)) {
        problems.push({
          code: 'committed-goals-unavailable',
          message: `版本 ${entry.version} 已提交计划的目标读取失败：${
            reason instanceof Error ? reason.message : String(reason)
          }`
        })
      }
    }
  }

  return {
    entries,
    problems,
    goalSources,
    history: {
      key: historyKey,
      ready: !historyUnavailable,
      error: historyError,
      baselineCommit:
        committed.baselineCommit ??
        (sameHistory ? previousLoad?.history?.baselineCommit : undefined)
    }
  }
}
