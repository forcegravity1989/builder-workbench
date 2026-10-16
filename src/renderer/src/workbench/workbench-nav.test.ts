import { afterEach, describe, expect, it } from 'vitest'
import { setCycleView } from './cycle-view-state'
import { resolveWorkbenchNav, WORKBENCH_PLAN_SLOT } from './workbench-nav'

afterEach(() => {
  setCycleView('plan')
})

describe('resolveWorkbenchNav', () => {
  it('maps Orca slots onto Workbench nav', () => {
    expect(resolveWorkbenchNav('activity')).toBe('overview')
    expect(resolveWorkbenchNav(WORKBENCH_PLAN_SLOT)).toBe('plan')
    expect(resolveWorkbenchNav('tasks')).toBe('tasks')
    expect(resolveWorkbenchNav('automations')).toBe('automations')
    expect(resolveWorkbenchNav('space')).toBe('knowledge')
  })

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
