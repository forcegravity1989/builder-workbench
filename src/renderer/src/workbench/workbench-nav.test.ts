import { afterEach, describe, expect, it } from 'vitest'
import { setCycleView } from './cycle-view-state'
import { resolveWorkbenchNav, WORKBENCH_PLAN_SLOT } from './workbench-nav'

afterEach(() => {
  setCycleView('plan')
})

describe('resolveWorkbenchNav', () => {
  // G2 P3a ratchet 对冲（环 4 负面清单·装配例）：槽位→导航 id 的映射表断言删除
  // （纯 switch 装配，无业务推导；侧栏高亮改由版本行 active 态承担，artifacts
  // 子视图拆分与 terminal 分支解析两例保留看护）。

  it('splits the shared artifacts slot by the BW cycle sub-view', () => {
    setCycleView('acceptance')
    expect(resolveWorkbenchNav(WORKBENCH_PLAN_SLOT)).toBe('acceptance')
    setCycleView('plan')
    expect(resolveWorkbenchNav(WORKBENCH_PLAN_SLOT)).toBe('plan')
  })

  it('restores the board through native automation/history workspace navigation', () => {
    expect(resolveWorkbenchNav('terminal', { branch: 'bw/week-plan' })).toBe('plan')
    expect(resolveWorkbenchNav('terminal', { branch: 'refs/heads/bw/week-acceptance' })).toBe(
      'acceptance'
    )
    expect(resolveWorkbenchNav('terminal', { branch: 'bw/metrics-refresh' })).toBe(null)
    expect(resolveWorkbenchNav('tasks', { branch: 'bw/week-plan' })).toBe('tasks')
  })
})
