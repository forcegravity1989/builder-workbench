import type { PlanningMaterial, VersionGoal } from './version-material'

/**
 * 计划目标的编号约定：goalId 与计划屏显示序号是同一个身份。
 *
 * 计划屏/总览的 G1/G2 由 goals 数组下标现算（goalOrdinal），Issue 标题目标段
 * 又必须严格等于材料 goalId；只有让 goalId 也等于 `G{index+1}`，人按屏上编号
 * 写的标题才能归位。存量材料的随机 id 不在此处收敛（见
 * docs/05-features/version-planning/spec.md）。
 */
export function planningGoalId(index: number): string {
  return `G${index + 1}`
}

export function goalsUseOrdinalIds(goals: readonly Pick<VersionGoal, 'goalId'>[]): boolean {
  return goals.every((goal, index) => goal.goalId === planningGoalId(index))
}

/** 按当前列表顺序重写 goalId；计划内遗留的任务引用跟随原目标身份重映射。 */
export function normalizePlanningGoalIds(document: PlanningMaterial): PlanningMaterial {
  const existingIds = new Set(document.goals.map((goal) => goal.goalId))
  const remap = new Map<string, string>()
  const goals = document.goals.map((goal, index) => {
    const goalId = planningGoalId(index)
    if (goal.goalId !== goalId) {
      remap.set(goal.goalId, goalId)
    }
    return goal.goalId === goalId ? goal : { ...goal, goalId }
  })
  if (remap.size === 0) {
    return document
  }
  // 指向已删除目标的遗留任务不能保留旧编号：前移目标会占用该编号，留着就会
  // 悄悄挂到另一个目标上。任务引用本身可选，去掉 goalId 即回到未归类。
  const tasks = document.tasks.flatMap((task) => {
    if (!task.goalId) {
      return [task]
    }
    const goalId = remap.get(task.goalId)
    if (goalId) {
      return [{ ...task, goalId }]
    }
    if (existingIds.has(task.goalId)) {
      return [task]
    }
    const { goalId: _removed, ...rest } = task
    return [rest]
  })
  return { ...document, goals, tasks }
}

/**
 * 写入侧强制：新计划首次写目标、整组目标被替换、或现有目标已按序编号时，
 * 按列表顺序规整为 G1…Gn。存量材料（非规范 id 且目标仍在用）保持原样，
 * 读取兼容、不迁移。
 */
export function enforcePlanningGoalIds(
  document: PlanningMaterial,
  current: PlanningMaterial | null
): PlanningMaterial {
  const existing = current?.goals ?? []
  if (existing.length === 0) {
    return normalizePlanningGoalIds(document)
  }
  const existingIds = new Set(existing.map((goal) => goal.goalId))
  const keepsExistingGoal = document.goals.some((goal) => existingIds.has(goal.goalId))
  if (!keepsExistingGoal || goalsUseOrdinalIds(existing)) {
    return normalizePlanningGoalIds(document)
  }
  return document
}
