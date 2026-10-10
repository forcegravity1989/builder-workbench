/**
 * 一次性/循环判别与生命周期推导的唯一收口（design.md「判别收口」）。
 * 消费者不得各写字段判断；「已结束」是现算推导值（铁律一），不是存储状态，
 * 和人的暂停开关 enabled 分开呈现。
 */
import type { Automation } from './automations-types'
import { parseSchedule } from './automation-schedule-parsing'

/** onceAt 存在即一次性；此时 rrule 为空。判别只写在这一处。 */
export function isOneShotAutomation(automation: Pick<Automation, 'onceAt'>): boolean {
  return automation.onceAt !== undefined && automation.onceAt !== null
}

export type AutomationLifecycleState = 'active' | 'finished'

export function deriveLifecycleState(
  automation: Pick<
    Automation,
    'onceAt' | 'scheduledRunCount' | 'rrule' | 'missedRunGraceMinutes'
  >,
  now: number
): AutomationLifecycleState {
  if (isOneShotAutomation(automation)) {
    if ((automation.scheduledRunCount ?? 0) >= 1) {
      return 'finished'
    }
    const graceMs = automation.missedRunGraceMinutes * 60 * 1000
    return now > (automation.onceAt as number) + graceMs ? 'finished' : 'active'
  }
  const cap = automationRunCountCap(automation.rrule)
  if (cap !== null && (automation.scheduledRunCount ?? 0) >= cap) {
    return 'finished'
  }
  return 'active'
}

/** COUNT 只存在于 rrule；cron 与无 COUNT 的 rrule 没有上限。解析失败按无上限
 *  处理——读回不重判输入（同 isRunnableAutomationSchedule 的宽恕语义）。 */
export function automationRunCountCap(rrule: string): number | null {
  try {
    const parsed = parseSchedule(rrule)
    return parsed.kind === 'rrule' ? parsed.count : null
  } catch {
    return null
  }
}
