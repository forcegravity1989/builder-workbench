import { z } from 'zod'
import { Id, MaterialVersion, VersionTaskReferenceSchema } from './version-material-common'

/**
 * G2 任务屏 BW 范围（P4）：侧栏版本/目标入口打开同一个原生 TaskPage 时携带的
 * 可选上下文——版本 + 目标筛选 + 计划材料的完整任务引用集。范围只进
 * TaskPageData，不进搜索 query 或任何 provider 缓存键（防切版污染原生缓存）；
 * 无范围时原生任务页行为逐字不变。
 */
export const WorkbenchTaskScopeSchema = z.strictObject({
  version: MaterialVersion,
  /** null/缺省 = 本版全部目标；有值时 references 已由入口按目标过滤。 */
  goalId: Id.nullish(),
  /** 仅展示（如「G2 · 目标句」）；业务身份只认 goalId。 */
  goalLabel: z.string().nullish(),
  references: z.array(VersionTaskReferenceSchema)
})
export type WorkbenchTaskScope = z.infer<typeof WorkbenchTaskScopeSchema>

/** 范围身份键：装载 effect 的世代围栏，范围不变不重复读取 provider。 */
export function workbenchTaskScopeKey(scope: WorkbenchTaskScope): string {
  return JSON.stringify([
    scope.version,
    scope.goalId ?? '',
    scope.references.map((reference) => [
      reference.provider,
      reference.repository,
      reference.number,
      reference.goalId ?? ''
    ])
  ])
}
