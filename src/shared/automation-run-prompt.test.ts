import { describe, expect, it } from 'vitest'
import { combineAutomationRunPrompt } from './automation-run-prompt'

describe('combineAutomationRunPrompt', () => {
  it('appends one-shot context to the saved prompt as a single delivery', () => {
    expect(combineAutomationRunPrompt('SYSTEM', '本次处理请求：修复 v0.3')).toBe(
      'SYSTEM\n\n本次处理请求：修复 v0.3'
    )
  })
  it('returns the saved prompt unchanged when there is no one-shot context', () => {
    expect(combineAutomationRunPrompt('SYSTEM')).toBe('SYSTEM')
    expect(combineAutomationRunPrompt('SYSTEM', null)).toBe('SYSTEM')
    expect(combineAutomationRunPrompt('SYSTEM', '   ')).toBe('SYSTEM')
  })
})
