import { describe, expect, it } from 'vitest'
import {
  automationRunCountCap,
  deriveLifecycleState,
  isOneShotAutomation
} from './automation-schedule-kind'

const base = {
  rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
  missedRunGraceMinutes: 720
}

describe('automation schedule kind', () => {
  it('derives one-shot and count-capped lifecycle states', () => {
    const onceAt = new Date('2026-10-10T09:00:00').getTime()
    const withinGrace = onceAt + 60 * 60 * 1000
    const pastGrace = onceAt + 721 * 60 * 1000

    // 一次性：宽限内未跑 → active。
    expect(
      deriveLifecycleState({ ...base, rrule: '', onceAt, scheduledRunCount: 0 }, withinGrace)
    ).toBe('active')
    // 一次性：已派发（无论那次成功失败）→ finished。
    expect(
      deriveLifecycleState({ ...base, rrule: '', onceAt, scheduledRunCount: 1 }, pastGrace)
    ).toBe('finished')
    // 一次性：超宽限仍未跑 → finished。
    expect(
      deriveLifecycleState({ ...base, rrule: '', onceAt, scheduledRunCount: 0 }, pastGrace)
    ).toBe('finished')
    // 一次性判别只认 onceAt 存在。
    expect(isOneShotAutomation({ onceAt })).toBe(true)
    expect(isOneShotAutomation({})).toBe(false)

    // 循环：无上限永不因次数终结。
    expect(deriveLifecycleState({ ...base, scheduledRunCount: 99 }, pastGrace)).toBe('active')
    // 循环：到数 → finished；改大上限 → 复活（无特例逻辑，纯推导）。
    expect(
      deriveLifecycleState(
        { ...base, rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;COUNT=5', scheduledRunCount: 5 },
        pastGrace
      )
    ).toBe('finished')
    expect(
      deriveLifecycleState(
        { ...base, rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;COUNT=10', scheduledRunCount: 5 },
        pastGrace
      )
    ).toBe('active')
    // COUNT 只在 rrule 里；cron 与解析失败按无上限（读回不重判输入）。
    expect(automationRunCountCap('FREQ=MINUTELY;INTERVAL=30;COUNT=2')).toBe(2)
    expect(automationRunCountCap('30 * * * *')).toBeNull()
    expect(automationRunCountCap('')).toBeNull()
  })
})
