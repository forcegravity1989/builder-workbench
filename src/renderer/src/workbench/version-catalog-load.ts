import type { Worktree } from '../../../shared/worktree/types'
import { PlanningMaterialSchema } from '../../../shared/workbench/version-material'
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

type DraftDerivation = {
  draft: VersionCatalogDraftSource
  goals: VersionCatalogGoalRef[]
}

/**
 * 已保存计划的派生缓存，按 versionCatalogCacheKey（owner/项目/仓库/版本/修订）
 * 分隔；只是读取加速，不是任何状态的正本，页面重载即清空。修订变化产生新键，
 * 旧派生不会被新版本上下文命中。
 */
const draftDerivations = new Map<string, DraftDerivation>()
const committedGoalsCache = new Map<string, VersionCatalogGoalRef[]>()

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
    goals: parsed.data.goals.map((goal) => ({ goalId: goal.goalId, title: goal.title }))
  }
}

export type VersionCatalogPlanTree = {
  worktreeId: string
  /** 绑定限定的版本（已绑定计划树）；null=旧固定树（无绑定限定，列全部可读版本）。 */
  version: string | null
}

export type VersionCatalogProblem = { code: string; message: string }

export type VersionCatalogLoad = {
  entries: VersionCatalogEntry[]
  /** 草稿/已提交派生的读取失败如实上报（problem 通道）；缺席不等于没有草稿。 */
  problems: VersionCatalogProblem[]
}

/**
 * 装载一个项目的版本目录（P1b，P3a 扩展）：主干已提交材料 ∪ 本机与共享可见
 * 宿主的存活绑定；草稿目录与目标从已保存计划派生（旧固定树与各版绑定计划树
 * 并列入口）；有已提交材料但没有草稿派生目标的版本，从已提交计划派生目标
 * （只读回看，不要求树存在）。已清理版本随材料仍入列（retired 收起）。
 * 读取失败如实进 problems（调用方显示未知与原因），不装绿。
 */
export async function loadVersionCatalog(args: {
  scope: NativeWorkspaceScope
  /** 主工作树登记行：主干基线材料与已提交计划回看的读取入口。 */
  homeWorktreeId: string
  /** 计划树读取入口集：旧固定树（version null）＋各版绑定计划树；缺失时相应来源如实缺席。 */
  planTrees?: readonly VersionCatalogPlanTree[] | null
  /** 原生登记全集（renderer store，含配对宿主同步行），从中提取存活绑定。 */
  worktrees: readonly Worktree[]
  /** 项目全部注册行；缺省用 scope.repoId。 */
  repoIds?: readonly string[]
  /** 项目过滤前提（登记行带 projectId 时按项目排除，见 collect 注释）。 */
  projectId?: string | null
}): Promise<VersionCatalogLoad> {
  const { scope, homeWorktreeId, worktrees } = args
  const repoIds = args.repoIds ?? [scope.repoId]
  const historyPort = nativeVersionHistoryPort(scope.runtimeOwnerEnvironmentId)
  const problems: VersionCatalogProblem[] = []
  const committed = await historyPort.list({
    scope: { repoId: scope.repoId, worktreeId: homeWorktreeId, hostId: scope.hostId },
    currentOnly: true
  })

  const drafts: VersionCatalogDraftSource[] = []
  const goalsByVersion = new Map<string, VersionCatalogGoalRef[]>()
  for (const planTree of args.planTrees ?? []) {
    const materialPort = nativeVersionMaterialPort(
      {
        repoId: scope.repoId,
        worktreeId: planTree.worktreeId,
        hostId: scope.hostId,
        workflow: 'plan'
      },
      scope.runtimeOwnerEnvironmentId
    )
    // 单个计划树读取失败不拖垮整个目录：其余来源照实返回，失败进 problem 通道。
    try {
      const candidates = await materialPort.list()
      for (const candidate of candidates) {
        if (candidate.state !== 'ready') {
          continue
        }
        // 绑定树只派生自己绑定的版本（main 侧授权同样拒绝跨版；客户端先滤，
        // 避免无谓读取）。旧固定树（version null）保持全量列举的旧上下文。
        if (planTree.version !== null && candidate.version !== planTree.version) {
          continue
        }
        const snapshot = await materialPort.read(candidate.version)
        if (!snapshot) {
          continue
        }
        const key = versionCatalogCacheKey({
          hostId: scope.hostId,
          runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId,
          projectId: scope.projectId,
          repoId: scope.repoId,
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
            continue
          }
          derivation = derived
          draftDerivations.set(key, derivation)
        }
        drafts.push(derivation.draft)
        const existing = goalsByVersion.get(candidate.version)
        if (!existing) {
          goalsByVersion.set(candidate.version, derivation.goals)
        }
      }
    } catch (reason) {
      problems.push({
        code: 'draft-source-unavailable',
        message: `计划树${planTree.version ? ` ${planTree.version}` : '（旧固定树）'}草稿读取失败：${
          reason instanceof Error ? reason.message : String(reason)
        }`
      })
    }
  }

  const entries = mergeVersionCatalog({
    committed,
    drafts,
    goalsByVersion,
    workspaces: collectVersionCatalogWorkspaces(worktrees, repoIds, args.projectId)
  })

  // 已提交目标回看：有已提交计划材料但没有草稿派生目标的版本（旧版本/已清理
  // 版本，树不存在或不可读），从固定提交读回目标目录——只读回看不要求树。
  for (const entry of entries) {
    const planRef = entry.material.plan
    if (!planRef || entry.goals.length > 0) {
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
    const cached = committedGoalsCache.get(key)
    if (cached) {
      entry.goals = [...cached]
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
      const goals = plan.document.goals.map((goal) => ({
        goalId: goal.goalId,
        title: goal.title
      }))
      committedGoalsCache.set(key, goals)
      entry.goals = goals
    } catch (reason) {
      problems.push({
        code: 'committed-goals-unavailable',
        message: `版本 ${entry.version} 已提交计划的目标读取失败：${
          reason instanceof Error ? reason.message : String(reason)
        }`
      })
    }
  }

  return { entries, problems }
}
