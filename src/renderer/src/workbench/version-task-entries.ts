import {
  PlanningMaterialSchema,
  type PlanningMaterial
} from '../../../shared/workbench/version-material'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeVersionMaterialPort } from './version-material-port'
import type { VersionCatalogPlanTree } from './version-catalog-load'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'

/**
 * 版本计划文档的读取入口（G2 P3a）：任务屏范围与目标开工预填都要「本版计划
 * 的完整任务引用/目标」。优先绑定计划树（或旧固定树）的当前工作副本（草稿
 * 状态如实），树不可用时回落已提交材料的固定来源（只读回看，不要求树存在、
 * 不准备树）。读不到如实报 problem，不猜、不装绿。
 */

export type VersionPlanDocumentSource = 'draft' | 'committed' | 'none'

export type VersionPlanDocumentRead = {
  document: PlanningMaterial | null
  source: VersionPlanDocumentSource
  problem?: string
}

export async function loadVersionPlanDocument(args: {
  scope: NativeWorkspaceScope
  homeWorktreeId: string
  version: string
  /** 目录里的已提交材料引用（回落来源）；缺省且树不可读时如实 none。 */
  entry?: VersionCatalogEntry | null
  planTrees: readonly VersionCatalogPlanTree[]
}): Promise<VersionPlanDocumentRead> {
  const { scope, homeWorktreeId, version, entry, planTrees } = args
  const bound = planTrees.find((tree) => tree.version === version)
  const legacy = planTrees.find((tree) => tree.version === null)
  const draftProblems: string[] = []
  // 绑定树优先且独占：其读取失败不静默回落旧固定树草稿（同一版本可能存在
  // 两份工作副本，互相冒充即装绿）；仅在无绑定树时才用旧固定树（旧上下文）。
  for (const planTree of bound ? [bound] : legacy ? [legacy] : []) {
    try {
      const materialPort = nativeVersionMaterialPort(
        {
          repoId: scope.repoId,
          worktreeId: planTree.worktreeId,
          hostId: planTree.hostId ?? scope.hostId,
          workflow: 'plan'
        },
        planTree.runtimeOwnerEnvironmentId ?? scope.runtimeOwnerEnvironmentId
      )
      const snapshot = await materialPort.read(version)
      if (!snapshot) {
        continue
      }
      const parsed = PlanningMaterialSchema.safeParse(snapshot.document)
      if (!parsed.success) {
        draftProblems.push(`计划树读取到无法解析的 ${version} 计划材料`)
        continue
      }
      return { document: parsed.data, source: 'draft' }
    } catch (reason) {
      draftProblems.push(
        `计划树读取失败：${reason instanceof Error ? reason.message : String(reason)}`
      )
    }
  }
  const planRef = entry?.material.plan
  if (planRef) {
    try {
      const historyPort = nativeVersionHistoryPort(scope.runtimeOwnerEnvironmentId)
      const plan = await historyPort.readPlan({
        scope: { repoId: scope.repoId, worktreeId: homeWorktreeId, hostId: scope.hostId },
        planRef: {
          kind: 'committed',
          version,
          cycleId: planRef.cycleId,
          revision: planRef.revision,
          sourceCommit: planRef.sourceCommit
        }
      })
      const parsed = PlanningMaterialSchema.safeParse(plan.document)
      if (parsed.success) {
        return {
          document: parsed.data,
          source: 'committed',
          ...(draftProblems.length > 0
            ? { problem: `${draftProblems.join('；')}；已回落已提交材料（可能不含未提交修改）` }
            : {})
        }
      }
      draftProblems.push(`已提交计划材料无法解析（${version}）`)
    } catch (reason) {
      draftProblems.push(
        `已提交计划读取失败：${reason instanceof Error ? reason.message : String(reason)}`
      )
    }
  }
  return {
    document: null,
    source: 'none',
    problem:
      draftProblems.length > 0 ? draftProblems.join('；') : `版本 ${version} 没有可读的计划材料`
  }
}
