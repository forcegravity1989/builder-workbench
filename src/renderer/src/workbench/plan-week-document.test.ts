import { describe, expect, it } from 'vitest'
import {
  confirmPlanningStage,
  emptyPlanningDocument,
  nextGoalLabel,
  parsePlanningDocument,
  pickPlanningVersion
} from './plan-week-document'

describe('pickPlanningVersion', () => {
  it('uses default when nothing is on disk', () => {
    expect(pickPlanningVersion([])).toBe('default')
  })

  it('prefers the newest named version over default', () => {
    expect(
      pickPlanningVersion([
        { version: 'default', mtimeMs: 90 },
        { version: 'v0.3', mtimeMs: 10 },
        { version: 'v0.4', mtimeMs: 50 }
      ])
    ).toBe('v0.4')
  })
})

describe('parsePlanningDocument', () => {
  it('fills missing sections from the empty template', () => {
    const parsed = parsePlanningDocument('{"version":"v0.4","project":"Workbench"}', 'default')
    expect(parsed.version).toBe('v0.4')
    expect(parsed.project).toBe('Workbench')
    expect(parsed.results.goals).toEqual([])
    expect(parsed.plan.tasks).toEqual([])
  })
})

describe('nextGoalLabel', () => {
  it('skips used G numbers', () => {
    expect(nextGoalLabel([{ label: 'G1' }, { label: 'G3' }])).toBe('G2')
  })
})

describe('confirmPlanningStage', () => {
  it('rejects an empty plan', () => {
    expect(() => confirmPlanningStage(emptyPlanningDocument(), 'plan')).toThrow(
      '请先填写版本目标和任务'
    )
  })
})
