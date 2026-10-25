import { z } from 'zod'
import { areTaskSourceContextsEqual, type TaskSourceContext } from '../task-source-context'
import { TaskSourceContextSchema } from '../task-source-context-schema'
import { Id, MaterialVersion } from './version-material-common'

/**
 * G2 版本工作区绑定：BW 挂在原生工作区登记（WorktreeMeta）上的附属 metadata。
 *
 * 数据三分（spec「目录、绑定、持久化与共享」）：Git 材料是业务正本，Orca 登记是
 * 执行记录，本绑定只连接两者——不重复存目标标题、排序、Issue 状态或父级。
 * 每宿主保存、随登记删除消失；字段名微调须同步 version-workspace 的 spec/design。
 */
export const WORKBENCH_VERSION_BINDING_SCHEMA_VERSION = 1

export const WORKBENCH_VERSION_BINDING_WORKFLOWS = ['plan', 'acceptance', 'goal', 'issue'] as const
export type WorkbenchVersionBindingWorkflow = (typeof WORKBENCH_VERSION_BINDING_WORKFLOWS)[number]

export type WorkbenchVersionBinding = {
  schema: typeof WORKBENCH_VERSION_BINDING_SCHEMA_VERSION
  /** 归属版本，沿材料目录规则；分支名/目录名不是稳定身份。 */
  version: string
  /** 工作用途：计划 / 验收 / 目标协作 / Issue 执行。 */
  workflow: WorkbenchVersionBindingWorkflow
  /** 稳定目标 ID（计划投影，改名/排序不变）；仅 goal/issue 用途可携带。 */
  goalId?: string
  /** Issue 执行的任务来源身份（provider/项目/宿主/仓库）；任务编号沿原生 linked 字段，不在此重复。 */
  taskSource?: TaskSourceContext
}

/**
 * workflow 与 goalId/taskSource 的一致性规则（写入与读回同一口径）：
 * - plan/acceptance：固定流程树属于版本本身，不带目标或任务来源；
 * - goal：协作树必须有稳定 goalId，不承担单一任务来源；
 * - issue：执行树必须带任务来源身份，可选挂在目标目录下。
 */
export const WorkbenchVersionBindingSchema = z
  .strictObject({
    schema: z.literal(WORKBENCH_VERSION_BINDING_SCHEMA_VERSION),
    version: MaterialVersion,
    workflow: z.enum(WORKBENCH_VERSION_BINDING_WORKFLOWS),
    goalId: Id.optional(),
    taskSource: TaskSourceContextSchema.optional()
  })
  .superRefine((binding, ctx) => {
    if (binding.workflow === 'plan' || binding.workflow === 'acceptance') {
      if (binding.goalId !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Plan and acceptance bindings belong to the version itself and carry no goal',
          path: ['goalId']
        })
      }
      if (binding.taskSource !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Plan and acceptance bindings belong to the version itself and carry no task source',
          path: ['taskSource']
        })
      }
      return
    }
    if (binding.workflow === 'goal') {
      if (binding.goalId === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Goal workspace bindings require a stable goal id',
          path: ['goalId']
        })
      }
      if (binding.taskSource !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Goal workspace bindings collaborate across tasks and carry no single task source',
          path: ['taskSource']
        })
      }
      return
    }
    if (binding.taskSource === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Issue execution bindings require a task source identity',
        path: ['taskSource']
      })
    }
  })

/**
 * 读回防御：持久化值可能是旧写入、外部编辑或损坏数据。解析不过一律 null
 * （没数据就是 Unknown，不是绿）；不猜、不部分采纳。
 */
export function normalizeStoredWorkbenchVersionBinding(
  value: unknown
): WorkbenchVersionBinding | null {
  if (value === null || value === undefined) {
    return null
  }
  const parsed = WorkbenchVersionBindingSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function areWorkbenchVersionBindingsEqual(
  a: WorkbenchVersionBinding | null | undefined,
  b: WorkbenchVersionBinding | null | undefined
): boolean {
  const left = a ?? null
  const right = b ?? null
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.workflow === right.workflow &&
    (left.goalId ?? null) === (right.goalId ?? null) &&
    areTaskSourceContextsEqual(left.taskSource ?? null, right.taskSource ?? null)
  )
}

/**
 * 绑定读写请求：只用原生身份（project/repo/host/runtimeOwner/instanceId）定位实例，
 * 不接受客户端指定路径；路径与写授权由 owner runtime 的 workspace resolver 复核。
 */
export const VersionBindingScopeSchema = z.strictObject({
  repoId: Id,
  worktreeId: Id,
  hostId: Id,
  /** 原生项目身份核对；登记行缺 projectId 时如实拒绝而非跳过核对。 */
  projectId: Id.optional(),
  /** 实例围栏：登记实例已更换（路径重用/重建树）时拒绝，防冒用旧实例写入。 */
  instanceId: Id.optional()
})
export const VersionBindingSetSchema = VersionBindingScopeSchema.extend({
  /** null 清除绑定；对象必须通过 WorkbenchVersionBindingSchema。 */
  binding: WorkbenchVersionBindingSchema.nullable()
})
export type VersionBindingScope = z.infer<typeof VersionBindingScopeSchema>
export type VersionBindingSetRequest = z.infer<typeof VersionBindingSetSchema>
