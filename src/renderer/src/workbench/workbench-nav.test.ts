import { describe, expect, it } from 'vitest'
import { resolveWorkbenchNav, WORKBENCH_PLAN_SLOT } from './workbench-nav'

describe('resolveWorkbenchNav', () => {
  it('maps Orca slots onto Workbench nav', () => {
    expect(resolveWorkbenchNav('activity')).toBe('overview')
    expect(resolveWorkbenchNav(WORKBENCH_PLAN_SLOT)).toBe('plan')
    expect(resolveWorkbenchNav('tasks')).toBe('tasks')
    expect(resolveWorkbenchNav('automations')).toBe('automations')
    expect(resolveWorkbenchNav('space')).toBe('knowledge')
  })

  it('leaves execution dimmed', () => {
    expect(resolveWorkbenchNav('terminal')).toBe(null)
  })
})
