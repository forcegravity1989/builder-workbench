import { isDeepStrictEqual } from 'node:util'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type { AgentLaunchSettingsSource } from '../../shared/agent-launch-settings'

export function agentLaunchSettingsRollbackUpdates(
  before: AgentLaunchSettingsSource,
  applied: AgentLaunchSettingsSource,
  current: AgentLaunchSettingsSource,
  updates: AgentLaunchSettingsSource
): AgentLaunchSettingsSource {
  const defaultUnchanged = Object.is(current.defaultTuiAgent, applied.defaultTuiAgent)
  const rollback: AgentLaunchSettingsSource = {
    ...(Object.hasOwn(updates, 'defaultTuiAgent') && defaultUnchanged
      ? { defaultTuiAgent: before.defaultTuiAgent ?? null }
      : {}),
    ...(Object.hasOwn(updates, 'disabledTuiAgents') &&
    Object.is(current.disabledTuiAgents, applied.disabledTuiAgents)
      ? { disabledTuiAgents: before.disabledTuiAgents ?? [] }
      : {}),
    ...(Object.hasOwn(updates, 'agentCmdOverrides') &&
    Object.is(current.agentCmdOverrides, applied.agentCmdOverrides)
      ? { agentCmdOverrides: before.agentCmdOverrides ?? {} }
      : {})
  }
  const fields = ['agentDefaultArgs', 'agentDefaultEnv'] as const
  const changed = new Set(fields.flatMap((field) => Object.keys(updates[field] ?? {})))
  for (const field of fields) {
    if (Object.hasOwn(updates, field)) {
      Object.keys(before[field] ?? {}).forEach((agent) => changed.add(agent))
    }
  }
  for (const agent of changed) {
    if (!isTuiAgent(agent)) {
      continue
    }
    const touched = fields.filter(
      (field) =>
        Object.hasOwn(updates, field) &&
        !isDeepStrictEqual(before[field]?.[agent], applied[field]?.[agent])
    )
    if (
      !touched.length ||
      !fields.every((field) => isDeepStrictEqual(current[field]?.[agent], applied[field]?.[agent]))
    ) {
      continue
    }
    for (const field of touched) {
      const restored = { ...(rollback[field] ?? current[field]) }
      if (before[field] && Object.hasOwn(before[field], agent)) {
        Object.assign(restored, { [agent]: before[field]?.[agent] })
      } else {
        delete restored[agent]
      }
      Object.assign(rollback, { [field]: restored })
    }
  }
  return rollback
}
