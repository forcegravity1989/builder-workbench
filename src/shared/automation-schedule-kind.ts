/**
 * 一次性/循环判别与生命周期推导的唯一收口（design.md「判别收口」）。
 * 消费者不得各写字段判断；「已结束」是现算推导值（铁律一），不是存储状态，
 * 和人的暂停开关 enabled 分开呈现。
 */
import type { Automation } from './automations-types'

/** onceAt 存在即一次性；此时 rrule 为空。判别只写在这一处。
 *  谓词把 onceAt 收窄为 number，消费者在 true 分支内直接用，不写 as 断言。 */
export function isOneShotAutomation(
  automation: Pick<Automation, 'onceAt'>
): automation is Pick<Automation, 'onceAt'> & { onceAt: number } {
  return automation.onceAt !== undefined && automation.onceAt !== null
}

export type AutomationLifecycleState = 'active' | 'finished'

export function deriveLifecycleState(
  automation: Pick<Automation, 'onceAt' | 'scheduledRunCount' | 'missedRunGraceMinutes'>,
  now: number
): AutomationLifecycleState {
  if (isOneShotAutomation(automation)) {
    if ((automation.scheduledRunCount ?? 0) >= 1) {
      return 'finished'
    }
    const graceMs = automation.missedRunGraceMinutes * 60 * 1000
    return now > automation.onceAt + graceMs ? 'finished' : 'active'
  }
  // 循环任务不因次数终结（2026-10-10 再审砍除执行次数上限）。
  return 'active'
}
