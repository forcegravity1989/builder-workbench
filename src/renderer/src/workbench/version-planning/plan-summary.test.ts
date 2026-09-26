import { describe, expect, it } from 'vitest'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import { derivePlanMinutes } from './plan-summary'

describe('derived plan minutes', () => {
  it('preserves every promise and renders the adopted baseline as historical evidence', () => {
    const plan: PlanningMaterial = {
      schema_version: 3,
      version: 'v1',
      cycleId: 'cycle',
      summary: { progress: '', risks: '' },
      tasks: [],
      goals: Array.from({ length: 4 }, (_, i) => ({
        goalId: `g${i}`,
        title: `结果 ${i}`,
        metricTargets: [
          {
            ref: {
              name: 'latency',
              configurationCommit: 'a'.repeat(40),
              definitionHash: 'definition'
            },
            target: '10'
          }
        ]
      }))
    }
    const minutes = derivePlanMinutes(plan)
    expect(minutes.match(/^## /gm)).toHaveLength(3)
    expect(minutes).toContain('4. 结果 3')
    expect(minutes).toContain('计划基线 待核')
    expect(minutes).toContain('目标草案')
    expect(minutes).not.toContain('已确认')
    plan.goals[0].title = '修订后的承诺'
    expect(derivePlanMinutes(plan)).toContain('1. 修订后的承诺')
  })
})
