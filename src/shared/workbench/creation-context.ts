import type { TaskSourceContext } from '../task-source-context'
import {
  WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
  WorkbenchVersionBindingSchema,
  type WorkbenchVersionBinding
} from './version-binding'

/**
 * G2 创建期 BW 业务上下文（P4）：目标/Issue 开工入口打开原生创建器时携带；
 * 提交时按创建器的最终仓库与最终任务来源解析成绑定。用户改仓库即上下文失效
 * （清除旧建议、不写绑定），不把旧上下文绑到不匹配的工作区；不另造向导。
 */
export type WorkbenchCreationContext = {
  version: string
  workflow: 'goal' | 'issue'
  goalId?: string
  /** 打开上下文时的项目仓库；提交时仓库不一致则整体失效。 */
  repoId: string
}

/**
 * 提交时解析：goal 必须有 goalId；issue 必须有创建器最终的任务来源身份
 * （绑定契约 refine 同口径）。解析结果再过共享 schema，防御性兜底；
 * 任一证明缺失返回 null（宁可不绑定，不绑错归属）。
 */
export function resolveWorkbenchCreationBinding(
  context: WorkbenchCreationContext | null | undefined,
  submit: { repoId: string; taskSourceContext: TaskSourceContext | null | undefined }
): WorkbenchVersionBinding | null {
  if (!context || context.repoId !== submit.repoId) {
    return null
  }
  const candidate =
    context.workflow === 'goal'
      ? context.goalId
        ? {
            schema: WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
            version: context.version,
            workflow: 'goal' as const,
            goalId: context.goalId
          }
        : null
      : submit.taskSourceContext
        ? {
            schema: WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
            version: context.version,
            workflow: 'issue' as const,
            ...(context.goalId ? { goalId: context.goalId } : {}),
            taskSource: submit.taskSourceContext
          }
        : null
  if (!candidate) {
    return null
  }
  const parsed = WorkbenchVersionBindingSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}
