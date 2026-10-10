import { describe, expect, it } from 'vitest'
import { deriveLifecycleState, isOneShotAutomation } from './automation-schedule-kind'

const base = {
  missedRunGraceMinutes: 720
}

describe('automation schedule kind', () => {
  it('derives one-shot lifecycle states', () => {
    const onceAt = new Date('2026-10-10T09:00:00').getTime()
    const withinGrace = onceAt + 60 * 60 * 1000
    const pastGrace = onceAt + 721 * 60 * 1000

    // 一次性：宽限内未跑 → active。
    expect(deriveLifecycleState({ ...base, onceAt, scheduledRunCount: 0 }, withinGrace)).toBe(
      'active'
    )
    // 一次性：已派发（无论那次成功失败）→ finished。
    expect(deriveLifecycleState({ ...base, onceAt, scheduledRunCount: 1 }, pastGrace)).toBe(
      'finished'
    )
    // 一次性：超宽限仍未跑 → finished。
    expect(deriveLifecycleState({ ...base, onceAt, scheduledRunCount: 0 }, pastGrace)).toBe(
      'finished'
    )
    // 一次性判别只认 onceAt 存在。
    expect(isOneShotAutomation({ onceAt })).toBe(true)
    expect(isOneShotAutomation({})).toBe(false)

    // 循环：不因次数终结（2026-10-10 再审砍除执行次数上限）。
    expect(deriveLifecycleState({ ...base, scheduledRunCount: 99 }, pastGrace)).toBe('active')
  })
})
