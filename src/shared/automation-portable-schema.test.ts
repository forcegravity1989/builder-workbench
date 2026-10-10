import { describe, expect, it } from 'vitest'
import type { Automation } from './automations-types'
import {
  AUTOMATION_PORTABLE_SCHEMA_VERSION,
  parseAutomationPortable,
  projectAutomationPortable
} from './automation-portable-schema'

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'automation-1',
    name: 'Daily review',
    prompt: 'Review open changes.',
    precheck: { command: 'gh pr list', timeoutSeconds: 30 },
    agentId: 'codex',
    projectId: 'repo-1',
    executionTargetType: 'local',
    executionTargetId: 'local',
    schedulerOwner: 'local_host_service',
    workspaceMode: 'existing',
    workspaceId: 'worktree-1',
    baseBranch: 'main',
    reuseSession: true,
    timezone: 'UTC',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=30',
    dtstart: 1760000000000,
    enabled: true,
    nextRunAt: 1760000400000,
    missedRunPolicy: 'run_once_within_grace',
    missedRunGraceMinutes: 720,
    createdAt: 1759999000000,
    updatedAt: 1759999900000,
    webhookToken: 'secret-token',
    scheduledRunCount: 3,
    ...overrides
  }
}

describe('automation portable schema', () => {
  it('round-trips the portable subset and leaves machine-bound fields out', () => {
    const projected = projectAutomationPortable(makeAutomation())
    const text = JSON.stringify(projected)
    // 机器绑定字段（宿主/项目/工作区/启用态/计数/时间戳/webhook token）绝不进文件。
    for (const forbidden of [
      'webhookToken',
      'projectId',
      'workspaceId',
      'executionTargetId',
      'scheduledRunCount',
      'enabled',
      'nextRunAt',
      'createdAt',
      'updatedAt'
    ]) {
      expect(text).not.toContain(`"${forbidden}"`)
    }
    expect(parseAutomationPortable(text)).toEqual(projected)

    const oneShot = projectAutomationPortable(makeAutomation({ rrule: '', onceAt: 1893456000000 }))
    expect(oneShot.onceAt).toBe(1893456000000)
    expect(parseAutomationPortable(JSON.stringify(oneShot))).toEqual(oneShot)
  })

  it('names the missing field instead of importing partially', () => {
    const missingName = JSON.stringify({
      schemaVersion: AUTOMATION_PORTABLE_SCHEMA_VERSION,
      prompt: 'Review open changes.',
      agentId: 'codex',
      timezone: 'UTC',
      rrule: 'FREQ=DAILY',
      dtstart: 1760000000000,
      missedRunGraceMinutes: 720,
      workspaceMode: 'existing',
      baseBranch: null,
      reuseSession: false
    })
    expect(() => parseAutomationPortable(missingName)).toThrow(/name/)

    expect(() => parseAutomationPortable('not json')).toThrow(/JSON/)
    expect(() => parseAutomationPortable(JSON.stringify({ schemaVersion: 99 }))).toThrow(
      /schemaVersion/
    )
  })
})
