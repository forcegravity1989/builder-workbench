import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyAutomationCronSchedule,
  describeAutomationSchedule,
  formatAutomationSchedule
} from './automation-schedules'
import {
  buildAutomationCronSchedule,
  buildAutomationRrule,
  latestAutomationOccurrenceAtOrBefore,
  nextAutomationOccurrenceAfter
} from './automation-schedule-occurrences'
import {
  AUTOMATION_CRON_EXPRESSION_MAX_BYTES,
  getAutomationCronExpressionFields,
  isValidAutomationCronSchedule,
  isValidAutomationSchedule,
  parseAutomationRrule,
  parseSchedule,
  tryParseAutomationRrule
} from './automation-schedule-parsing'

function formatTimeForTest(hour: number, minute: number): string {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('automation schedules', () => {
  it('uses the latest overdue hourly occurrence for missed-run grace decisions', () => {
    const rrule = buildAutomationRrule({ preset: 'hourly', hour: 9, minute: 0 })
    const latest = latestAutomationOccurrenceAtOrBefore(
      rrule,
      new Date('2026-05-12T00:00:00').getTime(),
      new Date('2026-05-13T14:20:00').getTime()
    )
    expect(latest).toBe(new Date('2026-05-13T14:00:00').getTime())
  })

  it('does not return a future hourly dtstart that is off the scheduled minute', () => {
    const rrule = buildAutomationRrule({ preset: 'hourly', hour: 9, minute: 0 })
    const next = nextAutomationOccurrenceAfter(
      rrule,
      new Date('2026-05-13T10:30:00').getTime(),
      new Date('2026-05-13T09:00:00').getTime()
    )
    expect(next).toBe(new Date('2026-05-13T11:00:00').getTime())
  })

  it('computes weekday schedules without returning weekend candidates', () => {
    const rrule = buildAutomationRrule({ preset: 'weekdays', hour: 9, minute: 30 })
    const next = nextAutomationOccurrenceAfter(
      rrule,
      new Date('2026-05-01T00:00:00').getTime(),
      new Date('2026-05-15T12:00:00').getTime()
    )
    expect(new Date(next).getDay()).toBe(1)
    expect(new Date(next).getHours()).toBe(9)
    expect(new Date(next).getMinutes()).toBe(30)
  })

  it('round-trips a weekly schedule for editing', () => {
    const rrule = buildAutomationRrule({ preset: 'weekly', hour: 16, minute: 45, dayOfWeek: 3 })
    expect(parseAutomationRrule(rrule)).toEqual({
      preset: 'weekly',
      hour: 16,
      minute: 45,
      dayOfWeek: 3
    })
  })

  it('round-trips Sunday weekly schedules without coercing them to Monday', () => {
    const rrule = buildAutomationRrule({ preset: 'weekly', hour: 10, minute: 15, dayOfWeek: 0 })
    expect(parseAutomationRrule(rrule)).toEqual({
      preset: 'weekly',
      hour: 10,
      minute: 15,
      dayOfWeek: 0
    })
  })

  it('rejects malformed weekly BYDAY instead of remapping to Sunday', () => {
    expect(() => parseAutomationRrule('FREQ=WEEKLY;BYDAY=NO;BYHOUR=10;BYMINUTE=15')).toThrow(
      'Invalid recurrence day.'
    )
    expect(tryParseAutomationRrule('FREQ=WEEKLY;BYDAY=MO,NO;BYHOUR=10;BYMINUTE=15')).toBeNull()
  })

  it('rejects weekly RRULE schedules that cannot match any day', () => {
    const rrule = 'FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0'

    expect(isValidAutomationSchedule(rrule)).toBe(false)
    expect(() =>
      nextAutomationOccurrenceAfter(
        rrule,
        new Date('2026-05-01T00:00:00').getTime(),
        new Date('2026-05-02T00:00:00').getTime()
      )
    ).toThrow('Invalid recurrence day.')
  })

  it('formats invalid schedules with a safe fallback label', () => {
    expect(formatAutomationSchedule('FREQ=YEARLY')).toBe('Invalid schedule')
  })

  it('formats hourly schedules using the stored minute', () => {
    expect(formatAutomationSchedule('FREQ=HOURLY;BYMINUTE=5')).toBe('Hourly at :05')
  })

  it('computes custom cron schedules', () => {
    const next = nextAutomationOccurrenceAfter(
      '15 10 * * 1-5',
      new Date('2026-05-01T00:00:00').getTime(),
      new Date('2026-05-15T12:00:00').getTime()
    )
    expect(next).toBe(new Date('2026-05-18T10:15:00').getTime())

    const latest = latestAutomationOccurrenceAtOrBefore(
      '15 10 * * 1-5',
      new Date('2026-05-01T00:00:00').getTime(),
      new Date('2026-05-15T12:00:00').getTime()
    )
    expect(latest).toBe(new Date('2026-05-15T10:15:00').getTime())
  })

  it('builds cron schedules from simple automation presets', () => {
    expect(buildAutomationCronSchedule({ preset: 'hourly', hour: 9, minute: 15 })).toBe(
      '15 * * * *'
    )
    expect(buildAutomationCronSchedule({ preset: 'daily', hour: 9, minute: 15 })).toBe('15 9 * * *')
    expect(buildAutomationCronSchedule({ preset: 'weekdays', hour: 9, minute: 15 })).toBe(
      '15 9 * * 1-5'
    )
    expect(
      buildAutomationCronSchedule({ preset: 'weekly', hour: 9, minute: 15, dayOfWeek: 0 })
    ).toBe('15 9 * * 0')
  })

  // Why: shared labels feed the CLI, so they must stay English on any OS locale (#14404).
  it('formats schedule labels without reading the OS weekday names', () => {
    const nativeDateTimeFormat = Intl.DateTimeFormat
    const dateTimeFormat = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
      ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
    ) {
      return new nativeDateTimeFormat(...args)
    } as unknown as typeof Intl.DateTimeFormat)
    const weeklyRrule = buildAutomationRrule({ preset: 'weekly', hour: 9, minute: 0, dayOfWeek: 5 })

    expect(formatAutomationSchedule('30 12 * * 7')).toBe(`Sundays at ${formatTimeForTest(12, 30)}`)
    expect(formatAutomationSchedule(weeklyRrule)).toBe(`Fridays at ${formatTimeForTest(9, 0)}`)
    expect(classifyAutomationCronSchedule('30 12 * * 7').label).toBe(
      `Sundays at ${formatTimeForTest(12, 30)}`
    )
    expect(
      dateTimeFormat.mock.calls.filter(([, options]) => options?.weekday !== undefined)
    ).toHaveLength(0)
  })

  it('exposes a locale-free descriptor for callers that render their own copy', () => {
    expect(describeAutomationSchedule('30 12 * * 7')).toEqual({
      kind: 'weekly',
      hour: 12,
      minute: 30,
      dayOfWeek: 0
    })
    expect(describeAutomationSchedule('5 * * * *')).toEqual({ kind: 'hourly', minute: 5 })
    expect(describeAutomationSchedule('15 10 * * MON-FRI')).toEqual({
      kind: 'weekdays',
      hour: 10,
      minute: 15
    })
    expect(describeAutomationSchedule('FREQ=DAILY;BYHOUR=9;BYMINUTE=0')).toEqual({
      kind: 'daily',
      hour: 9,
      minute: 0
    })
    expect(describeAutomationSchedule('FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0')).toEqual({
      kind: 'weekly',
      hour: 9,
      minute: 0,
      dayOfWeek: 5
    })
    expect(describeAutomationSchedule('*/30 9-17 * * MON-FRI')).toEqual({ kind: 'custom' })
    expect(describeAutomationSchedule('FREQ=YEARLY')).toEqual({ kind: 'invalid' })
  })

  it('formats simple cron schedules with friendly labels', () => {
    expect(formatAutomationSchedule('5 * * * *')).toBe('Hourly at :05')
    expect(formatAutomationSchedule('15 10 * * *')).toBe(`Daily at ${formatTimeForTest(10, 15)}`)
    expect(formatAutomationSchedule('15 10 * * MON-FRI')).toBe(
      `Weekdays at ${formatTimeForTest(10, 15)}`
    )
    expect(formatAutomationSchedule('30 12 * * 7')).toBe(`Sundays at ${formatTimeForTest(12, 30)}`)
  })

  it('tokenizes pasted cron whitespace without regex field splitting', () => {
    const split = vi.spyOn(String.prototype, 'split')
    const schedule = ['15', String.fromCharCode(160), '10\n*\t*\rMON-FRI'].join('')

    expect(getAutomationCronExpressionFields(schedule)).toEqual(['15', '10', '*', '*', 'MON-FRI'])
    expect(formatAutomationSchedule(schedule)).toBe(`Weekdays at ${formatTimeForTest(10, 15)}`)
    expect(
      split.mock.calls.filter(([pattern]) => pattern instanceof RegExp && pattern.source === '\\s+')
    ).toHaveLength(0)
  })

  it('rejects oversized pasted cron expressions before field tokenization', () => {
    const split = vi.spyOn(String.prototype, 'split')
    const oversizedSchedule = 'secret-cron-field '.repeat(AUTOMATION_CRON_EXPRESSION_MAX_BYTES)

    expect(getAutomationCronExpressionFields(oversizedSchedule)).toEqual([])
    expect(isValidAutomationCronSchedule(oversizedSchedule)).toBe(false)
    expect(
      split.mock.calls.filter(([pattern]) => pattern instanceof RegExp && pattern.source === '\\s+')
    ).toHaveLength(0)
  })

  it('classifies simple cron schedules for provider edit flows', () => {
    expect(classifyAutomationCronSchedule('15 10 * * MON-FRI')).toMatchObject({
      kind: 'weekdays',
      hour: 10,
      minute: 15
    })
    expect(classifyAutomationCronSchedule('30 12 * * 7')).toMatchObject({
      kind: 'weekly',
      hour: 12,
      minute: 30,
      dayOfWeek: 0
    })
  })

  it('labels valid unsupported cron schedules as custom schedules', () => {
    expect(formatAutomationSchedule('*/30 9-17 * * MON-FRI')).toBe('Custom schedule')
    expect(formatAutomationSchedule('0 9 1 * *')).toBe('Custom schedule')
    expect(formatAutomationSchedule('0 9 1 * MON')).toBe('Custom schedule')
    expect(formatAutomationSchedule('0 9,17 * * MON-FRI')).toBe('Custom schedule')
  })

  // Restriction is lexical (#15896), but a star step is still a star: `*/1` does not
  // restrict, so the day rule stays AND and this fires on Mondays only.
  it('treats a stepped cron day-of-month field as unrestricted for DOM/DOW matching', () => {
    const next = nextAutomationOccurrenceAfter(
      '0 9 */1 * MON',
      new Date('2026-05-01T00:00:00').getTime(),
      new Date('2026-05-15T12:00:00').getTime()
    )
    expect(next).toBe(new Date('2026-05-18T09:00:00').getTime())
    expect(isValidAutomationSchedule('0 9 * * 0-7')).toBe(true)
    expect(isValidAutomationSchedule('0 9 * * 1-7')).toBe(true)
  })

  it('rejects cron fields with malformed separators', () => {
    expect(isValidAutomationSchedule('*/15/2 9 * * *')).toBe(false)
    expect(isValidAutomationSchedule('0 9 1--5 * *')).toBe(false)
  })

  it('rejects syntactically valid cron schedules with no possible run', () => {
    expect(isValidAutomationSchedule('0 0 31 2 *')).toBe(false)
    expect(formatAutomationSchedule('0 0 31 2 *')).toBe('Invalid schedule')
  })

  it('rejects RRULE input with the cron-only validator', () => {
    const rrule = buildAutomationRrule({ preset: 'daily', hour: 9, minute: 0 })
    expect(isValidAutomationSchedule(rrule)).toBe(true)
    expect(isValidAutomationCronSchedule(rrule)).toBe(false)
  })

  it('finds rare but valid leap-day custom cron schedules', () => {
    const next = nextAutomationOccurrenceAfter(
      '0 0 29 2 *',
      new Date('2026-05-01T00:00:00').getTime(),
      new Date('2026-05-15T12:00:00').getTime()
    )
    expect(next).toBe(new Date('2028-02-29T00:00:00').getTime())
  })

  it('parses MINUTELY interval and COUNT rules and reverse-maps them', () => {
    // 解析：间隔是 RRULE 标准语义；BYHOUR/BYMINUTE 仅对日历型生效；
    // COUNT 容忍出现但不生效（2026-10-10 再审砍除执行次数上限）。
    const parsed = parseSchedule('FREQ=MINUTELY;INTERVAL=90;COUNT=5')
    expect(parsed).toMatchObject({ kind: 'rrule', freq: 'MINUTELY', interval: 90 })

    // 缺省：无 INTERVAL=1，与存量表达式解析结果一致。
    expect(parseSchedule('FREQ=DAILY;BYHOUR=9;BYMINUTE=0')).toMatchObject({
      freq: 'DAILY',
      interval: 1
    })

    // 反映射：90 分钟不是整小时 → every_n_minutes；120 分钟 → every_n_hours。
    expect(parseAutomationRrule('FREQ=MINUTELY;INTERVAL=90;COUNT=5')).toMatchObject({
      preset: 'every_n_minutes',
      intervalMinutes: 90
    })
    expect(parseAutomationRrule('FREQ=MINUTELY;INTERVAL=120')).toMatchObject({
      preset: 'every_n_hours',
      intervalMinutes: 120
    })

    // 非法值拒绝：INTERVAL 必须是正整数。
    expect(() => parseSchedule('FREQ=MINUTELY;INTERVAL=0')).toThrow()
    expect(() => parseSchedule('FREQ=MINUTELY;INTERVAL=abc')).toThrow()
  })

  it('computes every-90-minute occurrences from dtstart without hour boundaries', () => {
    const rrule = 'FREQ=MINUTELY;INTERVAL=90'
    const dtstart = new Date('2026-05-13T10:00:00').getTime()
    // 出现集：11:30、13:00、14:30……不受小时边界影响。
    expect(nextAutomationOccurrenceAfter(rrule, dtstart, dtstart)).toBe(
      new Date('2026-05-13T11:30:00').getTime()
    )
    expect(
      nextAutomationOccurrenceAfter(rrule, dtstart, new Date('2026-05-13T12:00:00').getTime())
    ).toBe(new Date('2026-05-13T13:00:00').getTime())
    expect(
      latestAutomationOccurrenceAtOrBefore(rrule, dtstart, new Date('2026-05-13T14:20:00').getTime())
    ).toBe(new Date('2026-05-13T13:00:00').getTime())
    // dtstart 后不足一个间隔：尚无出现。
    expect(
      latestAutomationOccurrenceAtOrBefore(rrule, dtstart, new Date('2026-05-13T11:00:00').getTime())
    ).toBeNull()

    // buildAutomationRrule：间隔表达往返（执行次数上限已砍，不再拼 COUNT）。
    expect(
      buildAutomationRrule({
        preset: 'every_n_minutes',
        hour: 9,
        minute: 0,
        intervalMinutes: 90
      })
    ).toBe('FREQ=MINUTELY;INTERVAL=90')
    expect(
      buildAutomationRrule({ preset: 'every_n_hours', hour: 9, minute: 0, intervalMinutes: 120 })
    ).toBe('FREQ=MINUTELY;INTERVAL=120')
  })
})
