import { describe, expect, it } from 'vitest'
import type { PlanningMaterial } from './version-material'
import { enforcePlanningGoalIds } from './planning-goal-ids'

const goal = (goalId: string, title = goalId) => ({ goalId, title, metricTargets: [] })
const task = (number: number, goalId?: string) => ({
  provider: 'github',
  repository: 'github.com/acme/app',
  number,
  ...(goalId ? { goalId } : {})
})

function plan(goals: string[], tasks: PlanningMaterial['tasks'] = []): PlanningMaterial {
  return {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    summary: { progress: '', risks: '' },
    goals: goals.map((goalId) => goal(goalId)),
    tasks
  }
}

describe('enforcePlanningGoalIds', () => {
  it('新计划按列表顺序编号并重映射计划内任务引用', () => {
    const result = enforcePlanningGoalIds(plan(['uuid-a', 'uuid-b'], [task(1, 'uuid-b')]), null)
    expect(result.goals.map((item) => item.goalId)).toEqual(['G1', 'G2'])
    expect(result.tasks[0]?.goalId).toBe('G2')
  })

  it('存量非规范 id 仍在用时原样保留；整组替换时规整', () => {
    const current = plan(['G1-deploy-usability', 'uuid-b'])
    const kept = enforcePlanningGoalIds(plan(['G1-deploy-usability', 'uuid-b', 'uuid-c']), current)
    expect(kept.goals.map((item) => item.goalId)).toEqual([
      'G1-deploy-usability',
      'uuid-b',
      'uuid-c'
    ])
    const replaced = enforcePlanningGoalIds(plan(['新目标一']), plan(['G1', 'G2']))
    expect(replaced.goals.map((item) => item.goalId)).toEqual(['G1'])
  })

  it('已按序计划的删除/重排按新位置重编号', () => {
    const result = enforcePlanningGoalIds(
      plan(['G2', 'G3'], [task(1, 'G2'), task(2, 'G1')]),
      plan(['G1', 'G2', 'G3'])
    )
    expect(result.goals.map((item) => item.goalId)).toEqual(['G1', 'G2'])
    expect(result.goals.map((item) => item.title)).toEqual(['G2', 'G3'])
    expect(result.tasks[0]?.goalId).toBe('G1')
    // 被删目标 G1 的遗留任务去掉引用，避免撞上 G3 前移后的新编号 G1。
    expect(result.tasks[1]?.goalId).toBeUndefined()
  })
})
