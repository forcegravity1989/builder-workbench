import type { AutomationUpdateInput } from '../../shared/automations-types'
import type { RuntimeAutomationUpdateInput } from './runtime-automation-controller'

export function hasRuntimeAutomationUpdateValue<K extends keyof RuntimeAutomationUpdateInput>(
  updates: RuntimeAutomationUpdateInput,
  key: K
): boolean {
  return Object.hasOwn(updates, key) && updates[key] !== undefined
}

/** Copies the wire-updatable fields onto the store patch; null rides (it clears). */
export function copyRuntimeAutomationPatchValues(
  updates: RuntimeAutomationUpdateInput,
  patch: AutomationUpdateInput
): void {
  const keys = [
    'name',
    'prompt',
    'precheck',
    'agentId',
    'runContext',
    'sourceContext',
    'baseBranch',
    'setupDecision',
    'reuseSession',
    'timezone',
    'rrule',
    'dtstart',
    // null 在此透传：它是显式清除一次性的信号。
    'onceAt',
    'enabled',
    'missedRunGraceMinutes'
  ] as const
  for (const key of keys) {
    if (hasRuntimeAutomationUpdateValue(updates, key)) {
      Object.assign(patch, { [key]: updates[key] })
    }
  }
}
