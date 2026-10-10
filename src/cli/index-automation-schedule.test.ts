import { describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('./runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  listEnvironments: listEnvironmentsMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from './index'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'
import {
  buildWorktree,
  okFixture,
  queueFixtures,
  worktreeListFixture,
  workspaceDestinationFixtures
} from './test-fixtures'

describe('orca cli worktree awareness', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  it('rejects invalid automation --day values before calling the runtime', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const priorExitCode = process.exitCode

    await main(
      [
        'automations',
        'create',
        '--name',
        'Weekly review',
        '--trigger',
        'weekly',
        '--day',
        '7',
        '--prompt',
        'Review open changes',
        '--provider',
        'codex',
        '--json'
      ],
      '/tmp/repo'
    )

    expect(callMock).not.toHaveBeenCalled()
    expect([...logSpy.mock.calls, ...errSpy.mock.calls].flat().join('\n')).toContain(
      '--day must be an integer from 0 to 6'
    )
    expect(process.exitCode).toBe(1)

    process.exitCode = priorExitCode
  })

  it.each([
    {
      name: 'day on daily preset',
      args: ['--trigger', 'daily', '--day', '2'],
      message: '--day can only be used with the weekly automation preset'
    },
    {
      name: 'time on custom cron',
      args: ['--trigger', '0 9 * * *', '--time', '10:30'],
      message: '--time can only be used with preset automation triggers'
    },
    {
      name: 'time on hourly preset',
      args: ['--trigger', 'hourly', '--time', '10:30'],
      message: '--time cannot be used with the hourly automation preset'
    }
  ])('rejects automation schedule modifier mismatch: $name', async ({ args, message }) => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const priorExitCode = process.exitCode

    await main(
      [
        'automations',
        'create',
        '--name',
        'Daily review',
        ...args,
        '--prompt',
        'Review open changes',
        '--provider',
        'codex',
        '--json'
      ],
      '/tmp/repo'
    )

    expect(callMock).not.toHaveBeenCalled()
    expect([...logSpy.mock.calls, ...errSpy.mock.calls].flat().join('\n')).toContain(message)
    expect(process.exitCode).toBe(1)

    process.exitCode = priorExitCode
  })

  it.each([
    {
      name: 'create',
      args: [
        'automations',
        'create',
        '--name',
        'Daily review',
        '--trigger',
        'daily',
        '--time',
        '--prompt',
        'Review open changes',
        '--provider',
        'codex',
        '--json'
      ]
    },
    {
      name: 'edit',
      args: ['automations', 'edit', 'auto-1', '--trigger', 'daily', '--time', '--json']
    }
  ])('rejects bare automation --time on $name', async ({ args }) => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const priorExitCode = process.exitCode

    await main(args, '/tmp/repo')

    expect(callMock).not.toHaveBeenCalled()
    expect([...logSpy.mock.calls, ...errSpy.mock.calls].flat().join('\n')).toContain(
      '--time must use HH:MM format'
    )
    expect(process.exitCode).toBe(1)

    process.exitCode = priorExitCode
  })

  it('rejects automation edit schedule modifiers without a schedule flag', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const priorExitCode = process.exitCode

    await main(['automations', 'edit', 'auto-1', '--day', '7', '--json'], '/tmp/repo')

    expect(callMock).not.toHaveBeenCalled()
    expect([...logSpy.mock.calls, ...errSpy.mock.calls].flat().join('\n')).toContain(
      '--day requires --trigger or --schedule'
    )
    expect(process.exitCode).toBe(1)

    process.exitCode = priorExitCode
  })

  it('creates a one-shot automation from --trigger once --at and refuses once without --at', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const priorExitCode = process.exitCode

    // once 缺 --at：没有目标时刻的一次性无从调度，触达 runtime 前拒绝。
    await main(
      [
        'automations',
        'create',
        '--name',
        'Nightly check',
        '--trigger',
        'once',
        '--prompt',
        'Check the repo',
        '--provider',
        'codex',
        '--json'
      ],
      '/tmp/repo'
    )
    expect(callMock).not.toHaveBeenCalled()
    expect([...logSpy.mock.calls, ...errSpy.mock.calls].flat().join('\n')).toContain(
      '--trigger once requires --at'
    )

    // once + 未来时刻：rrule 置空、onceAt 落目标时间，展示为 Once at 而非 Invalid schedule。
    callMock.mockReset()
    logSpy.mockClear()
    errSpy.mockClear()
    const at = new Date(Date.now() + 3 * 86_400_000)
    queueFixtures(
      callMock,
      worktreeListFixture([buildWorktree('/tmp/repo/feature', 'feature/foo', 'abc', 'repo-1')]),
      ...workspaceDestinationFixtures(),
      okFixture('req_automation_create', {
        automation: {
          id: 'auto-1',
          name: 'Nightly check',
          prompt: 'Check the repo',
          agentId: 'codex',
          projectId: 'repo-1',
          executionTargetType: 'local',
          executionTargetId: 'local',
          schedulerOwner: 'local_host_service',
          workspaceMode: 'existing',
          workspaceId: 'repo-1::/tmp/repo/feature',
          baseBranch: null,
          timezone: 'America/Toronto',
          rrule: '',
          dtstart: 1,
          onceAt: at.getTime(),
          enabled: true,
          nextRunAt: at.getTime(),
          missedRunPolicy: 'run_once_within_grace',
          missedRunGraceMinutes: 720,
          createdAt: 1,
          updatedAt: 1
        }
      })
    )

    await main(
      [
        'automations',
        'create',
        '--name',
        'Nightly check',
        '--trigger',
        'once',
        '--at',
        at.toISOString(),
        '--prompt',
        'Check the repo',
        '--provider',
        'codex'
      ],
      '/tmp/repo/feature/src'
    )

    expect(callMock).toHaveBeenNthCalledWith(
      4,
      'automation.create',
      expect.objectContaining({
        rrule: '',
        onceAt: at.getTime(),
        dtstart: expect.any(Number)
      })
    )
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Once at')

    process.exitCode = priorExitCode
    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  // 间隔表达按引擎既定语义归一为分钟（MINUTELY 数学，dtstart 锚点）：
  // HOURLY 分支不感知 INTERVAL，写 FREQ=HOURLY;INTERVAL=2 会实跑成每小时。
  it.each([
    { trigger: 'every 90m', rrule: 'FREQ=MINUTELY;INTERVAL=90' },
    { trigger: 'every 2h', rrule: 'FREQ=MINUTELY;INTERVAL=120' }
  ])('maps --trigger $trigger onto $rrule', async ({ trigger, rrule }) => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const priorExitCode = process.exitCode
    queueFixtures(
      callMock,
      worktreeListFixture([buildWorktree('/tmp/repo/feature', 'feature/foo', 'abc', 'repo-1')]),
      ...workspaceDestinationFixtures(),
      okFixture('req_automation_create', {
        automation: {
          id: 'auto-1',
          name: 'Interval check',
          prompt: 'Check the repo',
          agentId: 'codex',
          projectId: 'repo-1',
          executionTargetType: 'local',
          executionTargetId: 'local',
          schedulerOwner: 'local_host_service',
          workspaceMode: 'existing',
          workspaceId: 'repo-1::/tmp/repo/feature',
          baseBranch: null,
          timezone: 'America/Toronto',
          rrule,
          dtstart: 1,
          enabled: true,
          nextRunAt: 2,
          missedRunPolicy: 'run_once_within_grace',
          missedRunGraceMinutes: 720,
          createdAt: 1,
          updatedAt: 1
        }
      })
    )

    await main(
      [
        'automations',
        'create',
        '--name',
        'Interval check',
        '--trigger',
        trigger,
        '--prompt',
        'Check the repo',
        '--provider',
        'codex',
        '--json'
      ],
      '/tmp/repo/feature/src'
    )

    expect(callMock).toHaveBeenNthCalledWith(
      4,
      'automation.create',
      expect.objectContaining({ rrule })
    )

    process.exitCode = priorExitCode
    logSpy.mockRestore()
  })
})
