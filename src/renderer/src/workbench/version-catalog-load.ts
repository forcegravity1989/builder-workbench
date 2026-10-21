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

/**
 * 装载一个项目的版本目录（P1b）：主干已提交材料 ∪ 本机与共享可见宿主的存活
 * 绑定；草稿目录与目标从已保存计划派生。已清理版本随材料仍入列（retired 收起）。
 * 读取失败如实抛出（调用方显示未知），不装绿。
 */
export async function loadVersionCatalog(args: {
  scope: NativeWorkspaceScope
  /** 主工作树登记行：主干基线材料目录的读取入口。 */
  homeWorktreeId: string
  /** 计划树读取入口（现有固定树或已绑定计划树）；缺失时草稿与目标列为空。 */
  planWorktreeId?: string | null
  /** 原生登记全集（renderer store，含配对宿主同步行），从中提取存活绑定。 */
  worktrees: readonly Worktree[]
  /** 项目全部注册行；缺省用 scope.repoId。 */
  repoIds?: readonly string[]
}): Promise<VersionCatalogEntry[]> {
  const { scope, homeWorktreeId, planWorktreeId, worktrees } = args
  const repoIds = args.repoIds ?? [scope.repoId]
  const historyPort = nativeVersionHistoryPort(scope.runtimeOwnerEnvironmentId)
  const committed = await historyPort.list({
    scope: { repoId: scope.repoId, worktreeId: homeWorktreeId, hostId: scope.hostId },
    currentOnly: true
  })

  const drafts: VersionCatalogDraftSource[] = []
  const goalsByVersion = new Map<string, VersionCatalogGoalRef[]>()
  if (planWorktreeId) {
    const materialPort = nativeVersionMaterialPort(
      {
        repoId: scope.repoId,
        worktreeId: planWorktreeId,
        hostId: scope.hostId,
        workflow: 'plan'
      },
      scope.runtimeOwnerEnvironmentId
    )
    // 草稿来源读取失败不拖垮整个目录：已提交材料与绑定汇总仍如实返回，
    // 草稿/目标列缺席即为 Unknown。P1 无消费方，失败原因暂不上抛；
    // P3 接入界面时须为草稿读取失败接 problem 通道，如实呈现原因。
    try {
      const candidates = await materialPort.list()
      for (const candidate of candidates) {
        if (candidate.state !== 'ready') {
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
        goalsByVersion.set(candidate.version, derivation.goals)
      }
    } catch {
      // 计划树不可达（未准备/已清理/权限撤销）：草稿来源缺席，材料目录照实。
    }
  }

  return mergeVersionCatalog({
    committed,
    drafts,
    goalsByVersion,
    workspaces: collectVersionCatalogWorkspaces(worktrees, repoIds)
  })
}
