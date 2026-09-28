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

  it('leaves execution dimmed', () => {
    expect(resolveWorkbenchNav('terminal')).toBe(null)
  })
})
